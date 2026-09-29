import type { KpiMonth } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { KpiActor } from '../permissions'
import type { OverrideInput } from '../schemas'
import { effectiveStatus, isFinalStatus, transition } from '../state-machine'
import { KpiError } from './errors'
import { recordEvent } from './events'
import { assertFresh, loadForAction, stateOf, STALE_MESSAGE } from './kpi-load'
import type { KpiActionResult } from './claims'
import { isVisibleKpi } from './views'

function assertHr(actor: KpiActor): void {
  if (actor.role !== 'HR') throw new KpiError('HR access required', 403)
}

/** True once claims are closed and every visible KPI of the month has a final result. */
export async function monthIsComplete(month: KpiMonth, now: Date): Promise<boolean> {
  if (now <= month.claimsDueAt) return false
  const kpis = await prisma.kpi.findMany({
    where: { goal: { kpiMonthId: month.id, archivedAt: null } },
    select: { status: true, lockedSnapshot: true },
  })
  return kpis.filter(isVisibleKpi).every((kpi) => isFinalStatus(effectiveStatus(kpi.status, month, now)))
}

/** Marks a month final automatically, unless HR has ever reopened it (HR then finalizes it by hand). */
export async function refreshMonthFinalization(monthId: string, now: Date = new Date()): Promise<boolean> {
  const month = await prisma.kpiMonth.findUnique({ where: { id: monthId } })
  if (!month || month.finalizedAt) return false
  const reopened = await prisma.kpiEvent.count({ where: { kpiMonthId: monthId, action: 'MONTH_REOPEN' } })
  if (reopened > 0 || !(await monthIsComplete(month, now))) return false
  return prisma.$transaction(async (tx) => {
    const updated = await tx.kpiMonth.updateMany({ where: { id: monthId, finalizedAt: null }, data: { finalizedAt: now } })
    if (updated.count === 0) return false
    await recordEvent(tx, { kpiMonthId: monthId, actorId: null, actorRole: 'SYSTEM', action: 'MONTH_FINAL' })
    return true
  })
}

async function findMonth(monthId: string): Promise<KpiMonth> {
  const month = await prisma.kpiMonth.findUnique({ where: { id: monthId } })
  if (!month) throw new KpiError('Month not found', 404)
  return month
}

export async function markMonthFinal(actor: KpiActor, monthId: string, now: Date = new Date()): Promise<void> {
  assertHr(actor)
  const month = await findMonth(monthId)
  if (month.finalizedAt) throw new KpiError('This month is already final', 409)
  if (!(await monthIsComplete(month, now))) throw new KpiError('Some KPIs still need a claim or a decision', 409)
  await prisma.$transaction(async (tx) => {
    const updated = await tx.kpiMonth.updateMany({ where: { id: monthId, finalizedAt: null }, data: { finalizedAt: now } })
    if (updated.count === 0) throw new KpiError('This month is already final', 409)
    await recordEvent(tx, { kpiMonthId: monthId, actorId: actor.id, actorRole: 'HR', action: 'MONTH_FINAL' })
  })
}

export async function reopenMonth(actor: KpiActor, monthId: string, reason: string, now: Date = new Date()): Promise<void> {
  assertHr(actor)
  const month = await findMonth(monthId)
  if (!month.finalizedAt) throw new KpiError('This month is not final', 409)
  await prisma.$transaction(async (tx) => {
    await tx.kpiMonth.update({ where: { id: monthId }, data: { finalizedAt: null } })
    await recordEvent(tx, {
      kpiMonthId: monthId, actorId: actor.id, actorRole: 'HR', action: 'MONTH_REOPEN', reason,
      before: { finalizedAt: month.finalizedAt }, after: { reopenedAt: now },
    })
  })
}

export async function overrideResult(actor: KpiActor, kpiId: string, input: OverrideInput, now: Date = new Date()): Promise<KpiActionResult> {
  assertHr(actor)
  const { before, kpi } = await loadForAction(kpiId, () => true, 'HR access required', now)
  assertFresh(before, input.version)
  if (kpi.goal.kpiMonth.finalizedAt) throw new KpiError('Reopen the month before correcting a result', 409)
  const result = transition(stateOf(kpi), { type: 'HR_OVERRIDE', to: input.to }, kpi.goal.kpiMonth, now)
  if (!result.ok) throw new KpiError(result.error, 409)
  return prisma.$transaction(async (tx) => {
    const updated = await tx.kpi.updateMany({
      where: { id: kpi.id, version: kpi.version },
      data: { status: result.to, decidedById: actor.id, decidedAt: now, decisionNote: `Corrected by HR: ${input.reason}`, version: { increment: 1 } },
    })
    if (updated.count === 0) throw new KpiError(STALE_MESSAGE, 409)
    await recordEvent(tx, {
      kpiId: kpi.id, kpiMonthId: kpi.goal.kpiMonthId, actorId: actor.id, actorRole: 'HR', action: 'OVERRIDE',
      fromStatus: kpi.status, toStatus: result.to, reason: input.reason,
    })
    return { id: kpi.id, status: result.to, version: kpi.version + 1 }
  })
}

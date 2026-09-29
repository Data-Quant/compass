import { Prisma, type KpiMonth } from '@prisma/client'
import { prisma } from '@/lib/db'
import { defaultDeadlines, formatMonthKey, validateDeadlineOrder, type KpiMonthDeadlines, type MonthKey } from '../calendar'
import type { KpiActor } from '../permissions'
import type { MonthView } from '../view-types'
import type { Db } from './db'
import { KpiError } from './errors'
import { recordEvent } from './events'

export interface ResolvedMonth extends KpiMonthDeadlines { id: string | null; year: number; month: number }

const deadlinesOf = (d: KpiMonthDeadlines): KpiMonthDeadlines => ({
  goalsLockAt: d.goalsLockAt, claimsDueAt: d.claimsDueAt, verifyDueAt: d.verifyDueAt, responseDueAt: d.responseDueAt, targetFinalAt: d.targetFinalAt,
})

/** The saved month, or unsaved defaults. Reads never create rows. */
export async function resolveMonth(key: MonthKey, db: Db = prisma): Promise<ResolvedMonth> {
  const row = await db.kpiMonth.findUnique({ where: { year_month: { year: key.year, month: key.month } } })
  return row ?? { id: null, year: key.year, month: key.month, ...defaultDeadlines(key) }
}

export async function ensureMonth(key: MonthKey, db: Db = prisma): Promise<KpiMonth> {
  return db.kpiMonth.upsert({
    where: { year_month: { year: key.year, month: key.month } },
    create: { year: key.year, month: key.month, ...defaultDeadlines(key) },
    update: {},
  })
}

export function toMonthView(month: ResolvedMonth, now: Date): MonthView {
  return {
    id: month.id,
    monthKey: formatMonthKey(month),
    goalsLockAt: month.goalsLockAt.toISOString(),
    claimsDueAt: month.claimsDueAt.toISOString(),
    verifyDueAt: month.verifyDueAt.toISOString(),
    responseDueAt: month.responseDueAt.toISOString(),
    targetFinalAt: month.targetFinalAt.toISOString(),
    locked: now > month.goalsLockAt,
  }
}

function assertHr(actor: KpiActor): void {
  if (actor.role !== 'HR') throw new KpiError('HR access required', 403)
}

export async function createMonth(actor: KpiActor, key: MonthKey, deadlines?: KpiMonthDeadlines): Promise<KpiMonth> {
  assertHr(actor)
  const values = deadlinesOf(deadlines ?? defaultDeadlines(key))
  const orderError = validateDeadlineOrder(values)
  if (orderError) throw new KpiError(orderError)
  return prisma.$transaction(async (tx) => {
    const existing = await tx.kpiMonth.findUnique({ where: { year_month: { year: key.year, month: key.month } } })
    if (existing) throw new KpiError(`${formatMonthKey(key)} already exists; edit its dates instead`, 409)
    const month = await tx.kpiMonth.create({ data: { year: key.year, month: key.month, ...values } })
    await recordEvent(tx, { kpiMonthId: month.id, actorId: actor.id, actorRole: actor.role, action: 'MONTH_CREATE', after: values })
    return month
  })
}

export async function updateMonthDeadlines(
  actor: KpiActor,
  monthId: string,
  deadlines: KpiMonthDeadlines,
  now: Date = new Date(),
): Promise<KpiMonth> {
  assertHr(actor)
  const values = deadlinesOf(deadlines)
  const orderError = validateDeadlineOrder(values)
  if (orderError) throw new KpiError(orderError)
  return prisma.$transaction(async (tx) => {
    const existing = await tx.kpiMonth.findUnique({ where: { id: monthId } })
    if (!existing) throw new KpiError('Month not found', 404)
    const month = await tx.kpiMonth.update({ where: { id: monthId }, data: values })
    await recordEvent(tx, { kpiMonthId: month.id, actorId: actor.id, actorRole: actor.role, action: 'MONTH_EDIT', before: deadlinesOf(existing), after: values })
    if (now <= values.goalsLockAt) await reopenLockedKpis(tx, month.id, actor)
    return month
  })
}

/**
 * Moving the lock to a date that has not passed reopens the month for editing, so
 * KPIs that already locked (and were not claimed) go back to draft. Without this a
 * lock saved under the old date would outlive HR's extension.
 */
async function reopenLockedKpis(tx: Prisma.TransactionClient, monthId: string, actor: KpiActor): Promise<void> {
  const locked = await tx.kpi.findMany({
    where: { goal: { kpiMonthId: monthId }, status: 'LOCKED', claimedById: null },
    select: { id: true, version: true },
  })
  for (const kpi of locked) {
    const result = await tx.kpi.updateMany({
      where: { id: kpi.id, version: kpi.version, status: 'LOCKED' },
      data: { status: 'DRAFT', lockedSnapshot: Prisma.DbNull, version: { increment: 1 } },
    })
    if (result.count === 0) continue
    await recordEvent(tx, {
      kpiId: kpi.id, kpiMonthId: monthId, actorId: actor.id, actorRole: actor.role, action: 'LOCK_REVERTED',
      fromStatus: 'LOCKED', toStatus: 'DRAFT', reason: 'KPI lock date moved later',
    })
  }
}

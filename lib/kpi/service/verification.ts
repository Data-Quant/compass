import { prisma } from '@/lib/db'
import { formatMonthKey } from '../calendar'
import { canVerify, isVerifierEligible, type KpiActor, type KpiRef } from '../permissions'
import type { DecideInput } from '../schemas'
import { transition, type KpiAction } from '../state-machine'
import type { ClaimerStats, KpiStatusValue, LeadClaimStats, SetterRejectionView, VerificationQueueResponse } from '../view-types'
import { setterRejectionStats } from './lead-history'
import type { KpiActionResult } from './claims'
import { byName, departmentLabel, loadKpiContext, personRef } from './context'
import { KpiError } from './errors'
import { eventRole, recordEvent } from './events'
import { refreshMonthFinalization } from './finalization'
import { assertFresh, kpiRefOf, loadForAction, stateOf, STALE_MESSAGE } from './kpi-load'

const VERIFY_DENIED = 'You cannot verify this KPI: verifiers never decide KPIs they own, set or claimed'

function decisionAction(status: KpiStatusValue, decision: DecideInput['decision']): KpiAction {
  if (status === 'APPEALED') {
    if (decision !== 'VERIFIED' && decision !== 'NOT_VERIFIED') throw new KpiError('After an appeal, choose Verified or Not verified')
    return { type: 'FINAL_DECISION', decision }
  }
  if (decision === 'NOT_VERIFIED') throw new KpiError('Choose Verified, Needs info or Rejected')
  return { type: 'DECIDE', decision }
}

export async function decideKpi(actor: KpiActor, kpiId: string, input: DecideInput, now: Date = new Date()): Promise<KpiActionResult> {
  if (!isVerifierEligible(actor)) throw new KpiError('Verifier access required', 403)
  const { before, kpi } = await loadForAction(kpiId, (k) => canVerify(actor, kpiRefOf(k)), VERIFY_DENIED, now)
  assertFresh(before, input.version)
  const note = input.note?.trim() || null
  if (input.decision !== 'VERIFIED' && !note) throw new KpiError('Add a note explaining what is missing or why')
  const result = transition(stateOf(kpi), decisionAction(kpi.status, input.decision), kpi.goal.kpiMonth, now)
  if (!result.ok) throw new KpiError(result.error, 409)
  const outcome = await prisma.$transaction(async (tx) => {
    const updated = await tx.kpi.updateMany({
      where: { id: kpi.id, version: kpi.version },
      data: { status: result.to, decidedById: actor.id, decidedAt: now, decisionNote: note, version: { increment: 1 } },
    })
    if (updated.count === 0) throw new KpiError(STALE_MESSAGE, 409)
    await recordEvent(tx, {
      kpiId: kpi.id, kpiMonthId: kpi.goal.kpiMonthId, actorId: actor.id, actorRole: eventRole(actor, 'VERIFIER'),
      action: kpi.status === 'APPEALED' ? 'FINAL_DECISION' : 'DECIDE', fromStatus: kpi.status, toStatus: result.to,
      ...(note ? { reason: note } : {}),
    })
    return { id: kpi.id, status: result.to, version: kpi.version + 1 }
  })
  await refreshMonthFinalization(kpi.goal.kpiMonthId, now)
  return outcome
}

/** Claims each person has claimed done, and how many of those were rejected or not verified at least once. */
export async function claimerStats(claimerIds: readonly string[]): Promise<Map<string, ClaimerStats>> {
  const ids = [...new Set(claimerIds)]
  const empty = new Map<string, ClaimerStats>(ids.map((id) => [id, { claims: 0, rejections: 0 }]))
  if (ids.length === 0) return empty
  const kpis = await prisma.kpi.findMany({ where: { claimedById: { in: ids } }, select: { id: true, claimedById: true } })
  const events = await prisma.kpiEvent.findMany({
    where: {
      kpiId: { in: kpis.map((kpi) => kpi.id) },
      OR: [
        { action: { in: ['CLAIM', 'CLAIM_REVISED'] }, toStatus: 'CLAIMED_DONE' },
        { action: { in: ['DECIDE', 'FINAL_DECISION'] }, toStatus: { in: ['REJECTED', 'NOT_VERIFIED'] } },
      ],
    },
    select: { kpiId: true, action: true },
  })
  const claimed = new Set(events.filter((event) => event.action.startsWith('CLAIM')).map((event) => event.kpiId))
  const rejected = new Set(events.filter((event) => !event.action.startsWith('CLAIM')).map((event) => event.kpiId))
  return new Map(
    ids.map((id) => {
      const own = kpis.filter((kpi) => kpi.claimedById === id)
      return [id, { claims: own.filter((kpi) => claimed.has(kpi.id)).length, rejections: own.filter((kpi) => rejected.has(kpi.id)).length }]
    }),
  )
}

const setterView = (stats: LeadClaimStats | undefined): SetterRejectionView => ({ rejectionRate: stats?.rejectionRate ?? null, decided: stats?.decided ?? 0, flagged: stats?.flagged ?? false })

export async function verificationQueue(actor: KpiActor, now: Date = new Date()): Promise<VerificationQueueResponse> {
  if (!isVerifierEligible(actor)) throw new KpiError('Verifier access required', 403)
  const ctx = await loadKpiContext()
  const rows = await prisma.kpi.findMany({
    where: { status: { in: ['CLAIMED_DONE', 'APPEALED'] }, goal: { archivedAt: null } },
    include: { goal: { include: { kpiMonth: true } }, assignees: true },
    orderBy: { claimedAt: 'asc' },
  })
  const stats = await claimerStats(rows.flatMap((row) => (row.claimedById ? [row.claimedById] : [])))
  const setters = await setterRejectionStats([...new Set(rows.map((row) => row.goal.setterId))], now)
  return {
    items: rows.map((row) => {
      const month = row.goal.kpiMonth
      const dueAt = row.status === 'APPEALED' ? month.targetFinalAt : month.verifyDueAt
      const ref: KpiRef = {
        scope: row.goal.scope, setterId: row.goal.setterId, departmentKey: row.goal.departmentKey,
        assigneeIds: row.assignees.map((assignee) => assignee.userId), claimedById: row.claimedById,
      }
      return {
        kpiId: row.id,
        version: row.version,
        title: row.title,
        target: row.target,
        goalTitle: row.goal.title,
        monthKey: formatMonthKey(month),
        scope: row.goal.scope,
        departmentLabel: row.goal.departmentKey ? departmentLabel(ctx, row.goal.departmentKey) : null,
        setter: personRef(ctx, row.goal.setterId),
        owners: ref.assigneeIds.map((id) => personRef(ctx, id)).sort(byName),
        claimedBy: row.claimedById ? personRef(ctx, row.claimedById) : null,
        claimedAt: row.claimedAt?.toISOString() ?? null,
        status: row.status,
        dueAt: dueAt.toISOString(),
        overdue: now > dueAt,
        canDecide: canVerify(actor, ref),
        claimerStats: (row.claimedById && stats.get(row.claimedById)) || { claims: 0, rejections: 0 },
        setterHistory: setterView(setters.get(row.goal.setterId)),
      }
    }),
  }
}

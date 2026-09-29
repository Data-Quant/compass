import type { KpiStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { canClaim, canDecideChange, canVerify, isHr, isVerifierEligible, type KpiActor, type KpiRef } from '../permissions'
import { effectiveStatus } from '../state-machine'

const OPEN_STATUSES: KpiStatus[] = ['DRAFT', 'LOCKED', 'CLAIMED_DONE', 'NEEDS_INFO', 'REJECTED', 'APPEALED']

/** How many KPI actions wait on this person: claims, replies, appeals, verifications and change decisions. */
export async function pendingCount(actor: KpiActor, now: Date = new Date()): Promise<number> {
  const kpis = await prisma.kpi.findMany({
    where: { status: { in: OPEN_STATUSES }, goal: { archivedAt: null, kpiMonth: { finalizedAt: null } } },
    include: { goal: { include: { kpiMonth: true } }, assignees: true, changes: { where: { status: 'PENDING' } } },
  })
  const verifier = isVerifierEligible(actor)
  return kpis.reduce((count, kpi) => {
    const status = effectiveStatus(kpi.status, kpi.goal.kpiMonth, now)
    const ref: KpiRef = {
      scope: kpi.goal.scope, setterId: kpi.goal.setterId, departmentKey: kpi.goal.departmentKey,
      assigneeIds: kpi.assignees.map((assignee) => assignee.userId), claimedById: kpi.claimedById,
    }
    // HR can claim as a backup, but is not counted for every team's claims.
    const claimer = !isHr(actor) && canClaim(actor, ref)
    const toClaim = claimer && (status === 'LOCKED' || status === 'NEEDS_INFO' || (status === 'REJECTED' && !kpi.appealUsedAt))
    const toVerify = verifier && (status === 'CLAIMED_DONE' || status === 'APPEALED') && canVerify(actor, ref)
    const toDecide = verifier && kpi.changes.some((change) => canDecideChange(actor, ref, change.requestedById))
    return count + [toClaim, toVerify, toDecide].filter(Boolean).length
  }, 0)
}

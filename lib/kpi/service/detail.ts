import { z } from 'zod'
import { prisma } from '@/lib/db'
import { formatMonthKey } from '../calendar'
import { canClaim, canVerify, canViewKpi, isHr, isVerifierEligible, type KpiActor } from '../permissions'
import type { KpiDetailResponse } from '../view-types'
import { toChangeRequestView } from './changes'
import { byName, departmentLabel, loadKpiContext, personRef } from './context'
import { KpiError } from './errors'
import { findKpi, kpiRefOf } from './kpi-load'
import { toMonthView } from './months'
import { claimerStats } from './verification'
import { toKpiView } from './views'

const snapshotSchema = z.object({
  title: z.string(),
  target: z.string(),
  evidenceType: z.enum(['LINK', 'DOCUMENT', 'NUMBER', 'CLIENT_CONFIRMATION']),
  assigneeIds: z.array(z.string()),
})

/** One KPI in full. History and requests go to verifiers, HR, the setter and whoever can claim; owners see the result only. */
export async function kpiDetail(actor: KpiActor, kpiId: string, now: Date = new Date()): Promise<KpiDetailResponse> {
  const ctx = await loadKpiContext()
  const kpi = await findKpi(kpiId)
  const ref = kpiRefOf(kpi)
  if (!canViewKpi(actor, ref, ctx.scope)) throw new KpiError('KPI not found', 404)
  const month = kpi.goal.kpiMonth
  const verifier = isVerifierEligible(actor)
  const insider = verifier || isHr(actor) || actor.id === kpi.goal.setterId || canClaim(actor, ref)
  const [events, requests] = insider
    ? await Promise.all([
        prisma.kpiEvent.findMany({ where: { kpiId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
        prisma.kpiChangeRequest.findMany({ where: { kpiId }, orderBy: { createdAt: 'asc' } }),
      ])
    : [[], []]
  const stats = verifier && kpi.claimedById ? (await claimerStats([kpi.claimedById])).get(kpi.claimedById) ?? null : null
  const snapshot = snapshotSchema.safeParse(kpi.lockedSnapshot)
  const view = toKpiView(ctx, actor, kpi.goal, kpi, month, now)
  return {
    kpi: {
      ...view,
      monthKey: formatMonthKey(month),
      goalTitle: kpi.goal.title,
      scope: kpi.goal.scope,
      departmentLabel: kpi.goal.departmentKey ? departmentLabel(ctx, kpi.goal.departmentKey) : null,
      setter: personRef(ctx, kpi.goal.setterId),
    },
    month: toMonthView(month, now),
    lockedSnapshot: snapshot.success
      ? {
          title: snapshot.data.title,
          target: snapshot.data.target,
          evidenceType: snapshot.data.evidenceType,
          owners: snapshot.data.assigneeIds.map((id) => personRef(ctx, id)).sort(byName),
        }
      : null,
    history: events.map((event) => ({
      id: event.id,
      at: event.createdAt.toISOString(),
      actorName: event.actorId ? personRef(ctx, event.actorId).name : 'System',
      actorRole: event.actorRole,
      action: event.action,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      reason: event.reason,
    })),
    changeRequests: requests.map((request) => toChangeRequestView(ctx, actor, request, kpi)),
    canDecide: verifier && canVerify(actor, ref) && (view.status === 'CLAIMED_DONE' || view.status === 'APPEALED'),
    decidedBy: verifier && kpi.decidedById ? personRef(ctx, kpi.decidedById) : null,
    claimerStats: stats,
  }
}

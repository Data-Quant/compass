import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { KpiRef } from '../permissions'
import type { KpiStateLike } from '../state-machine'
import { KpiError } from './errors'
import { persistSystemTransitions } from './system'

export const kpiInclude = {
  goal: { include: { kpiMonth: true } },
  assignees: true,
  files: { orderBy: { createdAt: 'asc' } },
  changes: { where: { status: 'PENDING' } },
} as const satisfies Prisma.KpiInclude
export type LoadedKpi = Prisma.KpiGetPayload<{ include: typeof kpiInclude }>

export const STALE_MESSAGE = 'This KPI changed since you opened it; reload and try again'

export async function findKpi(kpiId: string): Promise<LoadedKpi> {
  const kpi = await prisma.kpi.findUnique({ where: { id: kpiId }, include: kpiInclude })
  if (!kpi || kpi.goal.archivedAt) throw new KpiError('KPI not found', 404)
  return kpi
}

export function kpiRefOf(kpi: LoadedKpi): KpiRef {
  return {
    scope: kpi.goal.scope,
    setterId: kpi.goal.setterId,
    departmentKey: kpi.goal.departmentKey,
    assigneeIds: kpi.assignees.map((assignee) => assignee.userId),
    claimedById: kpi.claimedById,
  }
}

export function stateOf(kpi: Pick<LoadedKpi, 'status' | 'appealUsedAt' | 'decidedById'>): KpiStateLike {
  return { status: kpi.status, appealUsedAt: kpi.appealUsedAt, decidedById: kpi.decidedById }
}

/**
 * Authorizes against the KPI as stored, then persists pending deadline transitions and reloads it.
 * `before.version` is what the caller's screen showed: reads never persist.
 */
export async function loadForAction(
  kpiId: string,
  allowed: (kpi: LoadedKpi) => boolean,
  deniedMessage: string,
  now: Date,
): Promise<{ before: LoadedKpi; kpi: LoadedKpi }> {
  const before = await findKpi(kpiId)
  if (!allowed(before)) throw new KpiError(deniedMessage, 403)
  await persistSystemTransitions({ id: kpiId }, now)
  return { before, kpi: await findKpi(kpiId) }
}

export function assertFresh(before: LoadedKpi, version: number): void {
  if (before.version !== version) throw new KpiError(STALE_MESSAGE, 409)
}

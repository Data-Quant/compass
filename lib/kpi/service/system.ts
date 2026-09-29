import type { KpiStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { pendingSystemTransitions } from '../state-machine'
import { type Db, inTransaction, toJson } from './db'
import { recordEvent } from './events'

const SYSTEM_PENDING_STATUSES: KpiStatus[] = ['DRAFT', 'LOCKED', 'NEEDS_INFO', 'REJECTED']

export function lockedSnapshotOf(kpi: { title: string; target: string; evidenceType: string; assignees: Array<{ userId: string }> }) {
  return {
    title: kpi.title,
    target: kpi.target,
    evidenceType: kpi.evidenceType,
    assigneeIds: kpi.assignees.map((assignee) => assignee.userId).sort(),
  }
}

/**
 * Persists deadline transitions (lock, unclaimed → NOT_DONE, unanswered → NOT_VERIFIED)
 * that effectiveStatus() already reports. Safe to call repeatedly.
 */
export async function persistSystemTransitions(where: Prisma.KpiWhereInput, now: Date = new Date(), db: Db = prisma): Promise<number> {
  const kpis = await db.kpi.findMany({
    where: { AND: [where, { status: { in: SYSTEM_PENDING_STATUSES } }] },
    include: { goal: { include: { kpiMonth: true } }, assignees: true },
  })
  let changed = 0
  for (const kpi of kpis) {
    const steps = pendingSystemTransitions(kpi.status, kpi.goal.kpiMonth, now)
    if (steps.length === 0) continue
    const locks = steps.some((step) => step.to === 'LOCKED')
    const applied = await inTransaction(db, async (tx) => {
      const result = await tx.kpi.updateMany({
        where: { id: kpi.id, version: kpi.version },
        data: {
          status: steps[steps.length - 1].to,
          version: { increment: 1 },
          ...(locks ? { lockedSnapshot: toJson(lockedSnapshotOf(kpi)) } : {}),
        },
      })
      if (result.count === 0) return false
      for (const step of steps) {
        await recordEvent(tx, { kpiId: kpi.id, actorId: null, actorRole: 'SYSTEM', action: step.reason, fromStatus: step.from, toStatus: step.to })
      }
      return true
    })
    if (applied) changed += 1
  }
  return changed
}

// §9 Compliance % excludes Not Applicable and Exempt tasks (and Cancelled —
// leavers / early close) from numerator and denominator.
import type { TaskStatus } from './types'

const EXCLUDED: readonly TaskStatus[] = ['NOT_APPLICABLE', 'EXEMPT', 'CANCELLED']

export interface TaskForStats {
  status: TaskStatus
  submitted: boolean
}

export interface ComplianceStats {
  total: number
  inScope: number
  verified: number
  submitted: number
  pendingReview: number
  expired: number
  excluded: number
  /** Verified ÷ in-scope, 0–100 (null when nothing is in scope). */
  compliancePct: number | null
  /** Submitted at least once ÷ in-scope, 0–100. */
  completionPct: number | null
}

const pct = (part: number, whole: number) => (whole === 0 ? null : Math.round((part / whole) * 1000) / 10)

export function complianceStats(tasks: readonly TaskForStats[]): ComplianceStats {
  const inScope = tasks.filter((task) => !EXCLUDED.includes(task.status))
  const verified = inScope.filter((task) => task.status === 'VERIFIED').length
  const submitted = inScope.filter((task) => task.submitted).length
  return {
    total: tasks.length,
    inScope: inScope.length,
    verified,
    submitted,
    pendingReview: inScope.filter((task) => task.status === 'PENDING_REVIEW').length,
    expired: inScope.filter((task) => task.status === 'EXPIRED').length,
    excluded: tasks.length - inScope.length,
    compliancePct: pct(verified, inScope.length),
    completionPct: pct(submitted, inScope.length),
  }
}

/** Employees whose most recent ≥2 tasks in a campaign lineage are consecutively Expired (§7). */
export function repeatExpiredUserIds(
  tasksByUser: ReadonlyMap<string, ReadonlyArray<{ cycleNumber: number; status: TaskStatus }>>,
): string[] {
  const flagged: string[] = []
  for (const [userId, tasks] of tasksByUser) {
    const finished = [...tasks].sort((a, b) => b.cycleNumber - a.cycleNumber)
    if (finished.length >= 2 && finished[0].status === 'EXPIRED' && finished[1].status === 'EXPIRED') flagged.push(userId)
  }
  return flagged.sort()
}

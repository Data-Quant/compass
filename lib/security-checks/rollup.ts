// §6 Subtask roll-up (strict precedence):
// any awaiting review → Pending Review; else any Rejected → Rejected;
// else any Requires-more-info → Requires Additional Information;
// else ≥1 Verified (rest N/A) → Verified; else all N/A → Not Applicable.
import type { SubtaskStatus, TaskStatus } from './types'

export type RolledUpStatus = Extract<TaskStatus, 'PENDING_REVIEW' | 'REJECTED' | 'REQUIRES_INFO' | 'VERIFIED' | 'NOT_APPLICABLE'>

/** Returns null while any subtask is still open (not yet submitted) or there are no subtasks. */
export function rollUp(statuses: readonly SubtaskStatus[]): RolledUpStatus | null {
  if (statuses.length === 0 || statuses.includes('OPEN')) return null
  if (statuses.includes('PENDING_REVIEW')) return 'PENDING_REVIEW'
  if (statuses.includes('REJECTED')) return 'REJECTED'
  if (statuses.includes('REQUIRES_INFO')) return 'REQUIRES_INFO'
  if (statuses.includes('VERIFIED')) return 'VERIFIED'
  return 'NOT_APPLICABLE'
}

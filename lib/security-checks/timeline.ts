// §4 Cycle and task timeline. Every task runs on its own deadline D:
//   D            — last moment for an on-time first submission
//   D+7          — task close (end of the grace window)
//   D+21         — review wrap-up end
// A resubmission made after task close is the final round; its review is due
// by the later of D+21 or 14 days after it was submitted. Every task is final
// by D+21, or D+42 at the very latest.
import { addDays, laterOf } from './dates'
import type { ExpiryReason, TaskStatus } from './types'

export const GRACE_DAYS = 7
export const WRAP_UP_DAYS = 21
export const RESUBMIT_WINDOW_DAYS = 7
export const FINAL_REVIEW_DAYS = 14
export const LATEST_FINAL_DAYS = 42

export interface TaskTimelineState {
  status: TaskStatus
  deadline: Date
  resubmitDueAt: Date | null
  finalRoundAt: Date | null
  expiryReason?: ExpiryReason | null
  /** Set when a Verified task is reopened; it earns a fresh review window. */
  reopenedAt?: Date | null
}

export function taskCloseOf(deadline: Date): Date {
  return addDays(deadline, GRACE_DAYS)
}

export function wrapUpEndOf(deadline: Date): Date {
  return addDays(deadline, WRAP_UP_DAYS)
}

/** Cycle-level scheduled close = cycle deadline + 7 days. */
export function scheduledCloseOf(cycleDeadline: Date): Date {
  return addDays(cycleDeadline, GRACE_DAYS)
}

/** Later of D or verdict + 7 days — every return verdict gives a full 7 days. */
export function resubmitWindowEnd(deadline: Date, verdictAt: Date): Date {
  return laterOf(deadline, addDays(verdictAt, RESUBMIT_WINDOW_DAYS))
}

/**
 * Later of D+21, final resubmission + 14 days, and (for a reopened Verified
 * task) reopen + 14 days. Reopen is allowed only until D+21, so this stays
 * within the D+42 guarantee.
 */
export function reviewDeadlineOf(task: Pick<TaskTimelineState, 'deadline' | 'finalRoundAt' | 'reopenedAt'>): Date {
  let deadline = wrapUpEndOf(task.deadline)
  if (task.finalRoundAt) deadline = laterOf(deadline, addDays(task.finalRoundAt, FINAL_REVIEW_DAYS))
  if (task.reopenedAt) deadline = laterOf(deadline, addDays(task.reopenedAt, FINAL_REVIEW_DAYS))
  return deadline
}

const after = (now: Date, limit: Date) => now.getTime() > limit.getTime()

export function isAwaitingFirstSubmission(status: TaskStatus): boolean {
  return status === 'NOT_STARTED' || status === 'IN_PROGRESS'
}

export function isReturned(status: TaskStatus): boolean {
  return status === 'REJECTED' || status === 'REQUIRES_INFO'
}

/** Whether the employee may still edit answers/evidence right now. */
export function canEmployeeEdit(task: TaskTimelineState, now: Date): boolean {
  if (isAwaitingFirstSubmission(task.status)) return !after(now, task.deadline)
  if (isReturned(task.status)) return task.resubmitDueAt !== null && !after(now, task.resubmitDueAt)
  return false
}

export type SubmissionCheck =
  | { ok: true; isResubmission: boolean; isFinal: boolean }
  | { ok: false; error: string }

export function checkSubmission(task: TaskTimelineState, now: Date): SubmissionCheck {
  if (isAwaitingFirstSubmission(task.status)) {
    if (after(now, task.deadline)) return { ok: false, error: 'The deadline for this task has passed' }
    return { ok: true, isResubmission: false, isFinal: false }
  }
  if (isReturned(task.status)) {
    if (!task.resubmitDueAt || after(now, task.resubmitDueAt)) {
      return { ok: false, error: 'The resubmission window for this task has closed' }
    }
    if (task.finalRoundAt) return { ok: false, error: 'The final resubmission has already been made' }
    return { ok: true, isResubmission: true, isFinal: after(now, taskCloseOf(task.deadline)) }
  }
  return { ok: false, error: 'This task cannot be submitted in its current state' }
}

export interface PendingExpiry {
  reason: ExpiryReason
  /** Unreviewed expiries are prominently flagged to the Security team. */
  flagUnreviewed: boolean
}

/** The scheduler-driven expiry this task is due for at `now`, if any. Exempt and final tasks never expire. */
export function pendingExpiry(task: TaskTimelineState, now: Date): PendingExpiry | null {
  if (isAwaitingFirstSubmission(task.status) && after(now, task.deadline)) {
    return { reason: 'NO_SUBMISSION', flagUnreviewed: false }
  }
  if (isReturned(task.status) && task.resubmitDueAt && after(now, task.resubmitDueAt)) {
    return { reason: 'WINDOW_LAPSED', flagUnreviewed: false }
  }
  if (task.status === 'PENDING_REVIEW' && after(now, reviewDeadlineOf(task))) {
    return { reason: 'UNREVIEWED', flagUnreviewed: true }
  }
  return null
}

export type ReturnOutcome =
  | { status: 'EXPIRED'; expiryReason: 'REJECTED_POST_CLOSE'; resubmitDueAt: null }
  | { status: 'REJECTED' | 'REQUIRES_INFO'; expiryReason: null; resubmitDueAt: Date }

/**
 * Outcome when a review round completes and the roll-up lands on Rejected /
 * Requires-more-info. A return verdict on the final post-close resubmission
 * expires the task immediately.
 */
export function returnOutcome(
  task: Pick<TaskTimelineState, 'deadline' | 'finalRoundAt'>,
  rolledUp: 'REJECTED' | 'REQUIRES_INFO',
  now: Date,
): ReturnOutcome {
  if (task.finalRoundAt) return { status: 'EXPIRED', expiryReason: 'REJECTED_POST_CLOSE', resubmitDueAt: null }
  return { status: rolledUp, expiryReason: null, resubmitDueAt: resubmitWindowEnd(task.deadline, now) }
}

/** A Verified task may be reopened until its wrap-up end (D+21). */
export function canReopen(task: TaskTimelineState, now: Date): boolean {
  return task.status === 'VERIFIED' && !after(now, wrapUpEndOf(task.deadline))
}

/** A no-submission Expired task may still be exempted until its own task close (D+7). */
export function canExemptExpired(task: TaskTimelineState, now: Date): boolean {
  return task.status === 'EXPIRED' && task.expiryReason === 'NO_SUBMISSION' && !after(now, taskCloseOf(task.deadline))
}

/** Reviewers may act on a pending task until its review deadline. */
export function canReview(task: TaskTimelineState, now: Date): boolean {
  return task.status === 'PENDING_REVIEW' && !after(now, reviewDeadlineOf(task))
}

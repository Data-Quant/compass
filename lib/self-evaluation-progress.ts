// Pure helpers for self-evaluation progress tracking. No DB/Prisma imports so the
// status derivation and summary math can be unit-tested in isolation.

export type SelfEvaluationProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED'

export const SELF_EVAL_PROGRESS_LABELS: Record<SelfEvaluationProgressStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
}

// Pending-first ordering so HR sees who still needs to act at the top of the list.
export const SELF_EVAL_PROGRESS_ORDER: Record<SelfEvaluationProgressStatus, number> = {
  NOT_STARTED: 0,
  IN_PROGRESS: 1,
  SUBMITTED: 2,
}

// DRAFT + never opened -> NOT_STARTED; DRAFT + saved at least once -> IN_PROGRESS;
// SUBMITTED -> SUBMITTED. `startedAt` is stamped on the first draft save.
export function deriveProgressStatus(row: {
  status: 'DRAFT' | 'SUBMITTED'
  startedAt: Date | null
}): SelfEvaluationProgressStatus {
  if (row.status === 'SUBMITTED') return 'SUBMITTED'
  return row.startedAt ? 'IN_PROGRESS' : 'NOT_STARTED'
}

export interface SelfEvaluationProgressSummary {
  sent: number
  submitted: number
  inProgress: number
  notStarted: number
}

// Roll a list of progress items up into per-status counts. `sent` is the total
// number of self-evaluations that exist for the period (all rows).
export function summarizeProgress(
  items: Array<{ progressStatus: SelfEvaluationProgressStatus }>
): SelfEvaluationProgressSummary {
  const summary: SelfEvaluationProgressSummary = { sent: 0, submitted: 0, inProgress: 0, notStarted: 0 }
  for (const item of items) {
    summary.sent++
    if (item.progressStatus === 'SUBMITTED') summary.submitted++
    else if (item.progressStatus === 'IN_PROGRESS') summary.inProgress++
    else summary.notStarted++
  }
  return summary
}

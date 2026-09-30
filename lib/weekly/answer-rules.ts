export const MAX_FIELD_CHARS = 4000
export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000
export const NOT_OBSERVED_SNOOZE_WEEKS = 3

export interface AnswerFields { situation: string; action: string; result: string; shortfall?: string | null }

export function countWords(text: string | null | undefined): number {
  const trimmed = (text ?? '').trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

/** Words in the three required boxes (the optional shortfall box is left out); used for the length-bias check. */
export function answerWordCount(fields: AnswerFields): number {
  return countWords(fields.situation) + countWords(fields.action) + countWords(fields.result)
}

/** What is missing before an answer can be submitted, or null. */
export function answerProblem(fields: AnswerFields): string | null {
  if (!fields.situation.trim()) return 'Describe the situation'
  if (!fields.action.trim()) return 'Add what they did'
  if (!fields.result.trim()) return 'Add what happened as a result'
  // No minimum length: a thin answer is caught by the AI as not enough evidence and gets a follow-up.
  return null
}

export function commentProblem(text: string | null | undefined): string | null {
  return (text ?? '').trim() ? null : 'Write a comment, or skip it'
}

export function editableUntil(submittedAt: Date): Date {
  return new Date(submittedAt.getTime() + EDIT_WINDOW_MS)
}

export function canEditSubmitted(input: { submittedAt: Date | null; reviewedByHuman: boolean; now: Date }): boolean {
  return input.submittedAt !== null && !input.reviewedByHuman && input.now <= editableUntil(input.submittedAt)
}

export type NotObservedOutcome =
  | { status: 'OPEN'; snoozedUntilWeek: number; notObservedCount: number }
  | { status: 'CLOSED_NOT_OBSERVED'; snoozedUntilWeek: null; notObservedCount: number }

export function afterNotObserved(notObservedCount: number, week: number): NotObservedOutcome {
  const count = notObservedCount + 1
  return count >= 2
    ? { status: 'CLOSED_NOT_OBSERVED', snoozedUntilWeek: null, notObservedCount: count }
    : { status: 'OPEN', snoozedUntilWeek: week + NOT_OBSERVED_SNOOZE_WEEKS, notObservedCount: count }
}

export type EvaluatorAnswerStatus =
  | 'OPEN' | 'DRAFT' | 'BEING_REVIEWED' | 'ACCEPTED' | 'ADD_DETAIL' | 'NOT_USED' | 'NOT_OBSERVED' | 'EXPIRED' | 'CANCELLED'

export const EVALUATOR_STATUS_LABELS: Record<EvaluatorAnswerStatus, string> = {
  OPEN: 'To answer',
  DRAFT: 'Draft',
  BEING_REVIEWED: 'Submitted',
  ACCEPTED: 'Accepted',
  ADD_DETAIL: 'Please add detail',
  NOT_USED: 'Not used as evidence',
  NOT_OBSERVED: 'Not observed',
  EXPIRED: 'Expired',
  CANCELLED: 'No longer needed',
}

/** D13: evaluators learn only whether an answer was accepted or needs detail, never its score. */
export function evaluatorStatus(input: { promptStatus: string; latestReviewAction: string | null; aiInsufficient: boolean }): EvaluatorAnswerStatus {
  switch (input.promptStatus) {
    case 'OPEN': return 'OPEN'
    case 'DRAFT': return 'DRAFT'
    case 'NOT_OBSERVED': return 'NOT_OBSERVED'
    case 'EXPIRED': return 'EXPIRED'
    case 'CANCELLED': return 'CANCELLED'
  }
  switch (input.latestReviewAction) {
    case 'ACCEPTED':
    case 'ADJUSTED':
    case 'AUTO_ACCEPTED':
    case 'MANUAL':
      return 'ACCEPTED'
    case 'MARKED_INSUFFICIENT':
      return 'ADD_DETAIL'
    case 'EXCLUDED':
      return 'NOT_USED'
    default:
      return input.aiInsufficient ? 'ADD_DETAIL' : 'BEING_REVIEWED'
  }
}

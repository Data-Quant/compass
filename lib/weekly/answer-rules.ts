import { noteRequired } from './mcq'

export const MAX_FIELD_CHARS = 4000
/** The inbox keeps a submitted answer in view for a day; after that it is in History. */
export const RECENTLY_SUBMITTED_MS = 24 * 60 * 60 * 1000
export const NOT_OBSERVED_SNOOZE_WEEKS = 3

/** What is missing before a chosen statement can be submitted, or null (UX spec, section 8). */
export function choiceProblem(input: { score: number; note: string | null | undefined }): string | null {
  if (noteRequired(input.score) && !(input.note ?? '').trim()) return 'Add a short note explaining this choice'
  return null
}

export function commentProblem(text: string | null | undefined): string | null {
  return (text ?? '').trim() ? null : 'Write a comment, or skip it'
}

/** A submitted answer stays editable until HR locks the quarter (HR's feedback, section 1). */
export function canEditSubmitted(input: { submittedAt: Date | null; periodLocked: boolean }): boolean {
  return input.submittedAt !== null && !input.periodLocked
}

export type NotObservedOutcome =
  | { status: 'OPEN'; snoozedUntilWeek: number; notObservedCount: number }
  | { status: 'CLOSED_NOT_OBSERVED'; snoozedUntilWeek: null; notObservedCount: number }

/** The question returns once, 3 weeks later; a second "Not observed" closes it. */
export function afterNotObserved(notObservedCount: number, week: number): NotObservedOutcome {
  const count = notObservedCount + 1
  return count >= 2
    ? { status: 'CLOSED_NOT_OBSERVED', snoozedUntilWeek: null, notObservedCount: count }
    : { status: 'OPEN', snoozedUntilWeek: week + NOT_OBSERVED_SNOOZE_WEEKS, notObservedCount: count }
}

export type EvaluatorAnswerStatus = 'OPEN' | 'DRAFT' | 'SUBMITTED' | 'NOT_OBSERVED' | 'EXPIRED' | 'CANCELLED'

export const EVALUATOR_STATUS_LABELS: Record<EvaluatorAnswerStatus, string> = {
  OPEN: 'To answer',
  DRAFT: 'Draft',
  SUBMITTED: 'Answered',
  NOT_OBSERVED: 'Not observed',
  EXPIRED: 'Expired',
  CANCELLED: 'No longer needed',
}

/** Evaluators never see scores; only whether they answered. */
export function evaluatorStatus(promptStatus: string): EvaluatorAnswerStatus {
  switch (promptStatus) {
    case 'OPEN': return 'OPEN'
    case 'DRAFT': return 'DRAFT'
    case 'NOT_OBSERVED': return 'NOT_OBSERVED'
    case 'EXPIRED': return 'EXPIRED'
    case 'CANCELLED': return 'CANCELLED'
    default: return 'SUBMITTED'
  }
}

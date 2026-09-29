import { stableHash } from './hash'

export const AUTO_ACCEPT_MS = 72 * 60 * 60 * 1000
export const SAMPLE_RATE = 0.1
export const MAX_FOLLOW_UPS = 2

export type ReviewReason = 'EXTREME_SCORE' | 'LOW_CONFIDENCE' | 'FLAGGED' | 'SAMPLED' | 'SCORING_FAILED' | 'CORRECTED'
export const REVIEW_REASON_LABELS: Record<ReviewReason, string> = {
  EXTREME_SCORE: 'Proposed 1 or 4',
  LOW_CONFIDENCE: 'Low confidence',
  FLAGGED: 'Flagged',
  SAMPLED: 'Random check',
  SCORING_FAILED: 'Scoring failed — score by hand',
  CORRECTED: 'Re-scored after an HR correction',
}

export type AnswerState = 'SCORING' | 'FAILED' | 'INSUFFICIENT' | 'NEEDS_REVIEW' | 'AUTO_ACCEPT_PENDING' | 'DECIDED'
export const ANSWER_STATE_LABELS: Record<AnswerState, string> = {
  SCORING: 'Being scored',
  FAILED: 'Scoring failed',
  INSUFFICIENT: 'Waiting for more detail',
  NEEDS_REVIEW: 'Needs review',
  AUTO_ACCEPT_PENDING: 'Accepted automatically after 72 hours',
  DECIDED: 'Decided',
}

export interface AnswerStateInput {
  responseId: string
  /** The scoring job for the answer's current revision. */
  job: { status: string; updatedAt: Date } | null
  /** The latest AI score for the answer's current revision. */
  aiScore: { createdAt: Date; sufficiency: string; score: number | null; confidence: string; flags: readonly string[] } | null
  latestReview: { createdAt: Date } | null
  /** Any review by a person (not the 72-hour auto-accept), or an HR correction of the text, at any time. */
  humanReviewedBefore: boolean
}

/** The random 10% calibration sample, stable per answer. */
export function isSampled(responseId: string): boolean {
  return stableHash(responseId) % 1000 < SAMPLE_RATE * 1000
}

/** Health, harassment or legal matters: HR only, never auto-accepted, and never sent back to the evaluator automatically. */
export function isSensitive(flags: readonly string[]): boolean {
  return flags.includes('SENSITIVE_CONTENT')
}

/**
 * Why HR must review an AI score; empty means it is auto-accepted after 72 hours. Thin answers get a follow-up
 * instead, unless they disclose something sensitive, which HR sees first.
 */
export function reviewReasons(score: { sufficiency: string; score: number | null; confidence: string; flags: readonly string[] }, responseId: string): ReviewReason[] {
  if (score.sufficiency !== 'SUFFICIENT') return isSensitive(score.flags) ? ['FLAGGED'] : []
  const reasons: ReviewReason[] = []
  if (score.score === 1 || score.score === 4) reasons.push('EXTREME_SCORE')
  if (score.confidence === 'LOW') reasons.push('LOW_CONFIDENCE')
  if (score.flags.length > 0) reasons.push('FLAGGED')
  if (reasons.length === 0 && isSampled(responseId)) reasons.push('SAMPLED')
  return reasons
}

export function isAutoAcceptDue(scoredAt: Date, now: Date): boolean {
  return now.getTime() - scoredAt.getTime() >= AUTO_ACCEPT_MS
}

/**
 * A review decides the AI score it follows. A newer AI score (HR corrected the text) reopens the answer, and
 * because a person already judged or corrected it, it goes back to HR rather than being auto-accepted or
 * waiting for detail. A failed job is decided by a review made after it failed.
 */
export function answerState(input: AnswerStateInput): { state: AnswerState; reasons: ReviewReason[] } {
  const decidedAfter = (instant: Date) => input.latestReview !== null && input.latestReview.createdAt >= instant
  if (input.job && (input.job.status === 'PENDING' || input.job.status === 'RUNNING')) return { state: 'SCORING', reasons: [] }
  if (input.aiScore) {
    if (decidedAfter(input.aiScore.createdAt)) return { state: 'DECIDED', reasons: [] }
    const reasons: ReviewReason[] = [...reviewReasons(input.aiScore, input.responseId), ...(input.humanReviewedBefore ? (['CORRECTED'] as const) : [])]
    if (input.aiScore.sufficiency !== 'SUFFICIENT' && reasons.length === 0) return { state: 'INSUFFICIENT', reasons: [] }
    return { state: reasons.length > 0 ? 'NEEDS_REVIEW' : 'AUTO_ACCEPT_PENDING', reasons }
  }
  if (input.job?.status === 'FAILED') {
    return decidedAfter(input.job.updatedAt) ? { state: 'DECIDED', reasons: [] } : { state: 'FAILED', reasons: ['SCORING_FAILED'] }
  }
  return { state: 'SCORING', reasons: [] }
}

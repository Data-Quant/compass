// Where an answer is between being given and counting (HR's decision: the model scores, HR reviews every score).
export type AnswerState = 'SCORING' | 'FAILED' | 'NEEDS_REVIEW' | 'DECIDED'
export const ANSWER_STATES: readonly AnswerState[] = ['NEEDS_REVIEW', 'FAILED', 'SCORING', 'DECIDED']

/** Only facts about the answer's current revision count: an edit sends it back through scoring and review. */
export function answerState(input: { jobStatus: string | null; hasAiScore: boolean; hasReview: boolean }): AnswerState {
  if (input.hasReview) return 'DECIDED'
  if (input.hasAiScore) return 'NEEDS_REVIEW'
  // CANCELLED: the model will not score it (its round stopped), so HR scores it.
  if (input.jobStatus === 'FAILED' || input.jobStatus === 'CANCELLED') return 'FAILED'
  return 'SCORING'
}

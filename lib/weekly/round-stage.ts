// The evaluation round's stage (UX spec, section 4), derived from the period and its weekly cycle: no separate state.
export type RoundStage = 'DRAFT' | 'REVIEW' | 'OPEN' | 'CLOSED' | 'RELEASED'

export const ROUND_STAGES: readonly RoundStage[] = ['DRAFT', 'REVIEW', 'OPEN', 'CLOSED', 'RELEASED']

export const ROUND_STAGE_LABELS: Record<RoundStage, string> = {
  DRAFT: 'Draft', REVIEW: 'Review', OPEN: 'Open', CLOSED: 'Closed', RELEASED: 'Released',
}

export function roundStage(input: { cycleStatus: 'SETUP' | 'RUNNING' | 'CLOSED'; reviewOpenedAt: Date | null; resultsPublishedAt: Date | null }): RoundStage {
  if (input.cycleStatus === 'CLOSED') return input.resultsPublishedAt ? 'RELEASED' : 'CLOSED'
  if (input.cycleStatus === 'RUNNING') return 'OPEN'
  return input.reviewOpenedAt ? 'REVIEW' : 'DRAFT'
}

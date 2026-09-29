// JSON-safe types shared by routes and client components. Dates are ISO strings.
import type { EvaluatorAnswerStatus } from './answer-rules'
import type { Perspective } from './perspectives'
import type { LevelKey, ProfileLevels } from './profile'
import type { AnswerState, ReviewReason } from './review-rules'

export interface PersonRef { id: string; name: string; position: string | null }
export type PromptKindValue = 'STANDARD' | 'FOLLOW_UP' | 'COMMENT'

export interface CycleSummary {
  id: string
  periodId: string
  periodName: string
  status: 'SETUP' | 'RUNNING' | 'CLOSED'
  weekOneStartsOn: string
  weeklyCap: number
  totalWeeks: number
  questionWeeks: number
  currentWeek: number
  simulatedWeek: number | null
}

export interface WeeklyMeResponse { enabled: boolean; cycleActive?: boolean; openCount?: number; isHr?: boolean; testTools?: boolean }

export interface AnswerView { situation: string; action: string; result: string; shortfall: string | null; commentText: string | null }

export interface InboxPrompt {
  id: string
  weekIndex: number
  kind: PromptKindValue
  status: 'OPEN' | 'DRAFT' | 'SUBMITTED'
  text: string
  topic: string
  perspective: Perspective
  evaluatee: PersonRef
  answer: AnswerView | null
  submittedAt: string | null
  editableUntil: string | null
  canEdit: boolean
  overdue: boolean
}

export interface EvaluateeProgress { evaluatee: PersonRef; perspective: Perspective; satisfied: number; total: number }

export interface InboxResponse { cycle: CycleSummary | null; prompts: InboxPrompt[]; progress: EvaluateeProgress[] }

export interface HistoryEntry {
  id: string
  weekIndex: number
  kind: PromptKindValue
  topic: string
  text: string
  status: EvaluatorAnswerStatus
  answer: AnswerView | null
  submittedAt: string | null
}
export interface HistoryGroup { evaluatee: PersonRef; perspective: Perspective; entries: HistoryEntry[] }
export interface HistoryResponse { cycle: CycleSummary | null; groups: HistoryGroup[] }

export interface AdminPeriodRow { id: string; name: string; startDate: string; endDate: string; isActive: boolean; isLocked: boolean; cycleId: string | null }
export interface AdminCyclesResponse { periods: AdminPeriodRow[]; cycles: CycleSummary[] }

export interface ProfileView {
  id: string
  version: number
  status: 'DRAFT' | 'APPROVED' | 'RETIRED'
  levels: ProfileLevels
  insufficientDefinition: string
  incomplete: boolean
  approvedAt: string | null
}
export interface ContentPrompt { id: string; variant: string; text: string; isActive: boolean }
export interface ContentCompetency {
  id: string
  key: string
  perspective: Perspective
  name: string
  definition: string
  custom: boolean
  leadName: string | null
  ready: boolean
  prompts: ContentPrompt[]
  approved: ProfileView | null
  draft: ProfileView | null
  hrDescriptions: Record<LevelKey, string | null>
}
export interface ContentResponse { competencies: ContentCompetency[] }

export interface ParticipantRow {
  person: PersonRef
  department: string | null
  exclusion: 'NOT_EVALUATED' | 'INACTIVE' | 'LEFT' | 'JOINED_LATE' | null
  optedIn: boolean
  optInReason: string | null
}
export interface ParticipantsResponse { cycleId: string; rows: ParticipantRow[] }

export interface QualityView {
  scored: number
  reviewedByHuman: number
  exactAgreement: number | null
  withinOneAgreement: number | null
  adjustmentsByTopic: Array<{ topic: string; adjusted: number; reviewed: number }>
  lengthScoreCorrelation: number | null
  lengthAlert: boolean
  flagCounts: Record<string, number>
  foursShare: Record<Perspective, number | null>
  tokens: number
}

export type ReviewFilter = 'NEEDS_REVIEW' | 'FAILED' | 'AUTO_ACCEPT' | 'FOLLOW_UP' | 'SCORING' | 'DECIDED'
export type ReviewActionValue = 'ACCEPTED' | 'ADJUSTED' | 'MARKED_INSUFFICIENT' | 'EXCLUDED' | 'AUTO_ACCEPTED' | 'MANUAL'

export interface AiScoreView {
  id: string
  sufficiency: 'SUFFICIENT' | 'INSUFFICIENT'
  score: number | null
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  criteriaMet: string[]
  criteriaNotDemonstrated: string[]
  evidenceQuotes: string[]
  rationale: string
  followUpPrompt: string | null
  flags: string[]
  model: string
  profileVersion: number | null
  createdAt: string
}
export interface DecisionView { id: string; action: ReviewActionValue; finalScore: number | null; reason: string | null; reviewerName: string | null; createdAt: string }
export interface ReviewAnswerView {
  responseId: string
  promptId: string
  weekIndex: number
  kind: PromptKindValue
  topic: string
  perspective: Perspective
  evaluator: PersonRef
  evaluatee: PersonRef
  question: string
  answer: AnswerView
  wordCount: number
  revision: number
  submittedAt: string | null
  state: AnswerState
  reasons: ReviewReason[]
  ai: AiScoreView | null
  decision: DecisionView | null
  /** Sent back with a decision; anything newer makes the decision stale. */
  basedOn: { aiScoreId: string | null; reviewId: string | null }
  autoAcceptAt: string | null
  jobError: string | null
}
export interface ReviewQueueResponse { cycleId: string; filter: ReviewFilter; counts: Record<ReviewFilter, number>; total: number; items: ReviewAnswerView[] }

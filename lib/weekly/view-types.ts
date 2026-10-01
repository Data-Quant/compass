// JSON-safe types shared by routes and client components. Dates are ISO strings.
import type { CalibrationSummary } from './calibration-rules'
import type { AggregationCounts } from './aggregation'
import type { EvaluatorAnswerStatus } from './answer-rules'
import type { Perspective } from './perspectives'
import type { LevelKey, ProfileLevels } from './profile'
import type { AnswerState, ReviewReason } from './review-rules'

export interface PersonRef { id: string; name: string; position: string | null }
export type PromptKindValue = 'STANDARD' | 'COMMENT'

export interface CycleSummary {
  id: string
  periodId: string
  periodName: string
  status: 'SETUP' | 'RUNNING' | 'CLOSED'
  weekOneStartsOn: string
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

/** Per person: topics answered (submitted), of which accepted (satisfied), out of all topics to cover. */
export interface EvaluateeProgress { evaluatee: PersonRef; perspective: Perspective; answered: number; satisfied: number; total: number }

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
export interface RemovedTopic { id: string; perspective: string; name: string; removedAt: string }
export interface ContentResponse { competencies: ContentCompetency[]; removed: RemovedTopic[] }

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

export type ReviewFilter = 'NEEDS_REVIEW' | 'FAILED' | 'AUTO_ACCEPT' | 'SCORING' | 'DECIDED'
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
  /** The calibration item copied from this answer, if HR added it to the set. */
  calibrationItemId: string | null
}
export interface ReviewQueueResponse { cycleId: string; filter: ReviewFilter; counts: Record<ReviewFilter, number>; total: number; items: ReviewAnswerView[] }

export interface CoverageView { evaluatee: PersonRef; perspective: Perspective; satisfied: number; total: number; evaluatorsContributing: number; share: number; lowEvidence: boolean }
export interface EvaluatorStatsView { evaluator: PersonRef; released: number; answered: number; notObserved: number; open: number; overdue: number; responseRate: number | null }
export interface DriftView { evaluator: PersonRef; perspective: Perspective; difference: number; count: number }
export interface DashboardResponse {
  cycle: CycleSummary
  queue: Record<ReviewFilter, number>
  jobs: { pending: number; failed: number }
  coverage: CoverageView[]
  evaluators: EvaluatorStatsView[]
  quality: QualityView
  drift: DriftView[]
  aiCost: AiCostView
  standards: StandardsUsedView[]
  /** The model scoring answers now, and whether it passed calibration; null when none is available. */
  gate: ModelGateView | null
}

export type FormRelationshipTypeValue = 'C_LEVEL' | 'DEPT' | 'HR'
export type FormStatusValue = 'NOT_STARTED' | 'DRAFT' | 'SUBMITTED' | 'CLOSED_BY_OTHER'
export interface FormSummaryView { relationshipType: FormRelationshipTypeValue; evaluatee: PersonRef; department: string | null; memberCount: number; status: FormStatusValue }
export interface FormsResponse { cycle: CycleSummary | null; open: boolean; opensAt: string | null; forms: FormSummaryView[] }
export interface FormQuestionView {
  id: string
  source: 'GLOBAL' | 'LEAD'
  text: string
  type: 'RATING' | 'TEXT'
  ratingDescriptions: Record<'1' | '2' | '3' | '4', string> | null
  ratingValue: number | null
  textResponse: string | null
}
export interface FormDetailResponse extends FormSummaryView { open: boolean; questions: FormQuestionView[]; fourRatings: { max: number; used: number } | null }

export interface DropCandidateView { evaluatee: PersonRef; perspective: Perspective; assignments: number }
export interface AggregationRunView { id: string; at: string; runBy: string; counts: AggregationCounts; drops: number }
export interface CloseViewResponse {
  cycle: CycleSummary
  periodLocked: boolean
  closedAt: string | null
  resultsPublishedAt: string | null
  challengeDeadline: string | null
  blockers: { scoring: number; failed: number; needsReview: number }
  /** Accepted automatically when HR closes. */
  pendingAutoAccept: number
  /** Unanswered questions; they expire at close. */
  openPrompts: number
  /** `outstanding`: names of the evaluators who still have forms to submit. */
  forms: { open: boolean; opensAt: string; total: number; done: number; outstanding: string[] }
  dropCandidates: DropCandidateView[]
  lowCoverage: CoverageView[]
  lastRun: AggregationRunView | null
  canClose: boolean
}

export type ChallengeStatusValue = 'OPEN' | 'UPHELD' | 'NOT_UPHELD'
export interface ChallengeView { id: string; status: ChallengeStatusValue; reason: string; resolution: string | null; createdAt: string; resolvedAt: string | null }
export interface MyChallengeResponse { available: boolean; periodName: string | null; deadline: string | null; canRaise: boolean; challenge: ChallengeView | null }
export interface ChallengeRow extends ChallengeView { evaluatee: PersonRef; resolvedBy: string | null }
export interface ChallengesResponse { cycleId: string; deadline: string | null; challenges: ChallengeRow[] }
export interface ChallengeDetailResponse { challenge: ChallengeRow; overallScore: number | null; answers: ReviewAnswerView[] }

export interface ModelPriceView { model: string; inputPerMillion: number; outputPerMillion: number }
export interface AiSettingsResponse {
  /** HR's choice; null means the deployment default (FIREWORKS_MODEL). */
  activeModel: string | null
  envModel: string | null
  /** The model that scores answers right now; null without an API key. */
  effectiveModel: string | null
  apiKeyConfigured: boolean
  standInForced: boolean
  /** The test tools are on, so calibration runs may use the stand-in. */
  standInAvailable: boolean
  prices: ModelPriceView[]
  updatedAt: string | null
  updatedBy: string | null
  gates: ModelGateView[]
}

export type SufficiencyValue = 'SUFFICIENT' | 'INSUFFICIENT'
export interface CalibrationTopicOption { id: string; name: string; perspective: Perspective }
export interface CalibrationItemView {
  id: string
  competencyId: string
  topic: string
  perspective: Perspective
  question: string
  situation: string
  action: string
  result: string
  shortfall: string | null
  hrSufficiency: SufficiencyValue
  hrScore: number | null
  note: string | null
  fromAnswer: boolean
  archived: boolean
  updatedAt: string
}
export interface CalibrationItemsResponse { items: CalibrationItemView[]; active: number; needed: number; topics: CalibrationTopicOption[] }

export type CalibrationRunStatusValue = 'RUNNING' | 'DONE' | 'FAILED'
export interface CalibrationRunRow {
  id: string
  kind: 'SET' | 'CYCLE'
  cycleId: string | null
  cycleName: string | null
  model: string
  promptVersion: string
  status: CalibrationRunStatusValue
  itemCount: number
  completed: number
  startedBy: string
  createdAt: string
  finishedAt: string | null
  /** Stored when the run ends; the detail view fills in the agreement so far for a running run. */
  summary: CalibrationSummary | null
  costUsd: number | null
  /** Calibration-set runs that finished: whether the model passes the trust gate. */
  gate: { passed: boolean; reasons: string[] } | null
}
export interface CalibrationRunsResponse { runs: CalibrationRunRow[] }
export interface CalibrationResultView {
  id: string
  label: string
  topic: string
  target: { sufficiency: SufficiencyValue; score: number | null }
  ai: { sufficiency: SufficiencyValue; score: number | null; confidence: string | null; rationale: string | null } | null
  exact: boolean | null
  withinOne: boolean | null
  error: string | null
  latencyMs: number
  completed: boolean
}
export interface CalibrationRunDetailResponse { run: CalibrationRunRow; results: CalibrationResultView[] }
export interface CalibrationProgressView { runId: string; status: CalibrationRunStatusValue; completed: number; itemCount: number; busy: boolean }

export interface ModelGateView {
  model: string
  trusted: boolean
  /** The preview's test double: always trusted. */
  standIn: boolean
  /** The latest completed calibration-set run on the current scoring prompt. */
  runId: string | null
  finishedAt: string | null
  reasons: string[]
}

export interface MoreEvidenceResponse { reopened: number; prompts: number; evaluators: number }

export interface AiCostView {
  /** US dollars; null while a model used this quarter has no price. */
  usd: number | null
  inputTokens: number
  outputTokens: number
  unpricedModels: string[]
  byModel: Array<{ model: string; inputTokens: number; outputTokens: number; usd: number | null }>
}
export interface StandardsUsedView {
  topic: string
  perspective: Perspective
  versions: Array<{ version: number; answers: number; status: 'DRAFT' | 'APPROVED' | 'RETIRED'; approvedAt: string | null }>
}


export interface PersonScoreAnswer {
  responseId: string
  evaluator: { id: string; name: string; position: string | null }
  perspective: string
  topic: string
  weekIndex: number
  submittedAt: string | null
  state: string
  stateLabel: string
  aiScore: number | null
  aiSufficiency: string | null
  aiConfidence: string | null
  aiRationale: string | null
  model: string | null
  /** The accepted score; null until HR or the 72-hour rule decides. */
  finalScore: number | null
}

export interface PersonScoreView {
  cycleId: string
  person: { id: string; name: string; position: string | null; department: string | null }
  /** Provisional score (1 to 4) from accepted answers only; the PE score itself is calculated at quarter close. */
  provisional: {
    score: number | null
    byRelationship: Array<{ relationshipType: string; label: string; count: number; average: number; weight: number }>
  }
  answers: PersonScoreAnswer[]
  people: Array<{ id: string; name: string; position: string | null }>
}

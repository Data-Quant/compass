// JSON-safe types shared by routes and client components. Dates are ISO strings.
import type { EvaluatorAnswerStatus } from './answer-rules'
import type { Perspective } from './perspectives'
import type { LevelKey, ProfileLevels } from './profile'

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

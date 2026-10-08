// JSON-safe types shared by routes and client components. Dates are ISO strings.
import type { AggregationCounts } from './aggregation'
import type { EvaluatorAnswerStatus } from './answer-rules'
import type { Perspective } from './perspectives'

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

/** The chosen statement and note, or a comment. Never the score. */
export interface AnswerView { optionId: string | null; note: string | null; commentText: string | null }
/** A statement as the evaluator sees it: no score. */
export interface ChoiceView { id: string; text: string }

export interface InboxPrompt {
  id: string
  weekIndex: number
  kind: PromptKindValue
  status: 'OPEN' | 'DRAFT' | 'SUBMITTED'
  text: string
  topic: string
  perspective: Perspective
  evaluatee: PersonRef
  /** The 8 statements in this evaluator's order; empty for a comment question. */
  options: ChoiceView[]
  answer: AnswerView | null
  submittedAt: string | null
  canEdit: boolean
  overdue: boolean
}

/** Per person: questions answered (or not observed) and answered with a choice (satisfied), of the quarter's questions. */
export interface EvaluateeProgress { evaluatee: PersonRef; perspective: Perspective; answered: number; satisfied: number; total: number }

export interface InboxResponse { cycle: CycleSummary | null; prompts: InboxPrompt[]; progress: EvaluateeProgress[] }

export interface HistoryEntry {
  id: string
  weekIndex: number
  kind: PromptKindValue
  topic: string
  text: string
  status: EvaluatorAnswerStatus
  options: ChoiceView[]
  answer: AnswerView | null
  submittedAt: string | null
  /** Submitted and the quarter is not locked. */
  canEdit: boolean
}
export interface HistoryGroup { evaluatee: PersonRef; perspective: Perspective; entries: HistoryEntry[] }
export interface HistoryResponse { cycle: CycleSummary | null; groups: HistoryGroup[] }

export interface AdminPeriodRow { id: string; name: string; startDate: string; endDate: string; isActive: boolean; isLocked: boolean; cycleId: string | null }
export interface AdminCyclesResponse { periods: AdminPeriodRow[]; cycles: CycleSummary[] }

/** One of a question's 8 statements; HR sees the score, evaluators never do. */
export interface McqOptionView { id: string; text: string; score: number }
export interface ContentPrompt {
  id: string
  variant: string
  text: string
  isActive: boolean
  options: McqOptionView[]
  /** Why these statements cannot be asked yet; null when they can. */
  problem: string | null
}
export interface ContentCompetency {
  id: string
  key: string
  perspective: Perspective
  name: string
  /** Asked only about people in these departments; empty for everyone. */
  departments: string[]
  ready: boolean
  prompts: ContentPrompt[]
}
export interface RemovedTopic { id: string; perspective: string; name: string; removedAt: string }
export interface ContentResponse { competencies: ContentCompetency[]; removed: RemovedTopic[] }

export interface ParticipantRow {
  person: PersonRef
  department: string | null
  exclusion: 'NOT_EVALUATED' | 'FILLED_BY_HR' | 'INACTIVE' | 'LEFT' | 'JOINED_LATE' | null
  optedIn: boolean
  optInReason: string | null
  leads: PersonRef[]
  reports: PersonRef[]
  peers: PersonRef[]
  /** When they said their lists look right during review; null if they have not. */
  confirmedAt: string | null
  /** Mapping gaps HR should fix or accept; acceptedReason is set once accepted. */
  warnings: Array<{ key: RoundWarningKey; acceptedReason: string | null }>
}
export type RoundWarningKey = 'NO_LEAD' | 'FEW_PEERS'
export interface ParticipantsResponse { cycleId: string; rows: ParticipantRow[] }

export interface CoverageView { evaluatee: PersonRef; perspective: Perspective; satisfied: number; total: number; evaluatorsContributing: number; share: number; lowEvidence: boolean }
export interface EvaluatorStatsView { evaluator: PersonRef; released: number; answered: number; notObserved: number; open: number; overdue: number; responseRate: number | null }
export interface DriftView { evaluator: PersonRef; perspective: Perspective; difference: number; count: number }
export interface DashboardResponse {
  cycle: CycleSummary
  coverage: CoverageView[]
  evaluators: EvaluatorStatsView[]
  drift: DriftView[]
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
export type FormTableKind = 'HR' | 'PARTNER'
export type TableRelationshipTypeValue = 'C_LEVEL' | 'DEPT' | 'HR' | 'TEAM_LEAD' | 'DIRECT_REPORT' | 'PEER' | 'CROSS_DEPARTMENT' | 'SELF'
export interface FormTableRow {
  /** The person, or a department's representative member. */
  evaluateeId: string
  name: string
  designation: string | null
  department: string | null
  memberCount: number
  status: FormStatusValue
  ratings: Record<string, number | null>
  total: number | null
}
export interface FormTableView {
  evaluator: PersonRef
  relationshipType: TableRelationshipTypeValue
  questions: FormTableQuestion[]
  rows: FormTableRow[]
}
export interface FormTableQuestion { id: string; source: 'GLOBAL' | 'LEAD'; text: string; ratingDescriptions: Record<'1' | '2' | '3' | '4', string | null> }
export interface FormTablesResponse { cycle: CycleSummary | null; open: boolean; locked: boolean; opensAt: string | null; tables: FormTableView[] }
export interface FormDetailResponse extends FormSummaryView { open: boolean; questions: FormQuestionView[]; fourRatings: { max: number; used: number } | null }

export interface DropCandidateView { evaluatee: PersonRef; perspective: Perspective; assignments: number }
export interface AggregationRunView { id: string; at: string; runBy: string; counts: AggregationCounts; drops: number }
export interface CloseViewResponse {
  cycle: CycleSummary
  periodLocked: boolean
  closedAt: string | null
  resultsPublishedAt: string | null
  /** Unanswered questions; they expire at close. */
  openPrompts: number
  /** `outstanding`: names of the evaluators who still have forms to submit. */
  forms: { open: boolean; opensAt: string; total: number; done: number; outstanding: string[] }
  dropCandidates: DropCandidateView[]
  lowCoverage: CoverageView[]
  lastRun: AggregationRunView | null
  canClose: boolean
}

export interface PairWindowView { evaluator: PersonRef; evaluatee: PersonRef; relationshipType: string; startWeek: number; weeks: number }

export type PeerChangeActionValue = 'ADD' | 'REMOVE'
export type PeerChangeStatusValue = 'PENDING' | 'NEEDS_INFO' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED'
export type PeerReplyValue = 'WORK_TOGETHER' | 'NOT_WORK_TOGETHER'
export type MappingReasonCodeValue = 'NO_LONGER_WORK_TOGETHER' | 'WRONG_PERSON' | 'OTHER'
export type PeerChangeVoteValue = 'PENDING' | 'APPROVED' | 'REJECTED'
export type MappingRelationValue = 'PEER' | 'LEAD' | 'REPORT'
export interface PeerRequestView {
  id: string
  action: PeerChangeActionValue
  /** A peer, the requester's lead, or one of their team members. */
  relation: MappingRelationValue
  status: PeerChangeStatusValue
  reasonCode: MappingReasonCodeValue | null
  reason: string | null
  /** Why it was declined, or HR's question while it needs more information. */
  decisionNote: string | null
  /** The requester's answer to HR's question. */
  answer: string | null
  createdAt: string
  requester: PersonRef
  peer: PersonRef
  /** The requester's lead, who approves a peer change; null when HR decides. */
  approver: PersonRef | null
  /** The peer's optional reply; it never blocks the change. */
  peerReply: PeerReplyValue | null
  approverVote: PeerChangeVoteValue
  /** The lead was reminded after 2 working days without a decision; HR sees it flagged. */
  overdue: boolean
}
export interface MyMappingResponse {
  period: { id: string; name: string; locked: boolean }
  leads: PersonRef[]
  reports: PersonRef[]
  peers: PersonRef[]
  requests: PeerRequestView[]
  /** People who could be added as a peer. */
  candidates: PersonRef[]
  /** When they said their lists look right; null until they do. */
  confirmedAt: string | null
}
export interface PeerRequestTokenView {
  requester: PersonRef
  peer: PersonRef
  action: PeerChangeActionValue
  role: 'PEER' | 'LEAD'
  status: PeerChangeStatusValue
  /** The lead's decision so far. */
  vote: PeerChangeVoteValue
  peerReply: PeerReplyValue | null
  periodName: string
  reasonCode: MappingReasonCodeValue | null
  reason: string | null
  /** How many peers the requester would have after this change. */
  peersLeft: number
}

export type SurveyKindValue = 'NPS' | 'AGREE' | 'CHOICE' | 'TEXT'
export interface SurveyQuestionView { id: string; orderIndex: number; text: string; kind: SurveyKindValue; options: string[]; required: boolean; explainChoice: boolean }
export interface MySurveyResponse { periodName: string | null; week: number | null; questions: SurveyQuestionView[]; notice: string }
export interface SurveyQuestionResult {
  id: string
  orderIndex: number
  text: string
  kind: SurveyKindValue
  removed: boolean
  responses: number
  /** Per answer: 0 to 10, 1 to 5 (Strongly disagree to Strongly agree), or each option. */
  counts: Record<string, number>
  /** % promoters (9–10) minus % detractors (0–6), for the 0 to 10 question. */
  enps: number | null
  average: number | null
  /** name is null for anonymous answers. */
  comments: Array<{ text: string; choice: string | null; name: string | null }>
}
export interface SurveyResultsResponse { questions: SurveyQuestionResult[] }

export interface ReviewStageView {
  periodId: string
  periodName: string
  /** When HR opened the review stage; null before. */
  openedAt: string | null
  reviewEndsAt: string
  leads: Array<{ lead: PersonRef; status: string; questionsSubmitted: boolean }>
}

export type RoundStageValue = 'DRAFT' | 'REVIEW' | 'OPEN' | 'CLOSED' | 'RELEASED'
export type RoundAction = 'open-review' | 'open-round' | 'close-round' | 'release'
export interface RoundSummary { periodId: string; cycleId: string; name: string; stage: RoundStageValue }
export interface RoundNextStep { action: RoundAction; label: string; sentence: string }
export interface RoundChecklistItem { key: string; label: string; done: boolean; count?: number; tab: 'overview' | 'people' | 'progress' | 'forms' | 'results' | 'advanced' }
export interface RoundView {
  periodId: string
  cycleId: string
  name: string
  stage: RoundStageValue
  locked: boolean
  startDate: string
  endDate: string
  weekOneStartsOn: string
  /** The end of the last catch-up week. */
  closesOn: string
  reviewOpenedAt: string | null
  reviewDeadline: string | null
  questionWeeks: number
  totalWeeks: number
  currentWeek: number | null
  /** The one primary step for this stage; null once released. */
  next: RoundNextStep | null
  checklist: RoundChecklistItem[]
}

export interface RoundResultRow {
  person: PersonRef
  department: string | null
  /** The report's overall score once generated. */
  score: number | null
  generatedAt: string | null
  email: { status: 'PENDING' | 'SENT' | 'FAILED'; sentAt: string | null } | null
}
export interface RoundResultsResponse { released: string | null; closed: boolean; emailsOn: boolean; rows: RoundResultRow[] }

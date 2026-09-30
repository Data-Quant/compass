// JSON-safe types shared by API routes and client components. Dates are ISO strings.

export type KpiStatusValue =
  | 'DRAFT'
  | 'LOCKED'
  | 'CLAIMED_DONE'
  | 'NOT_DONE'
  | 'NEEDS_INFO'
  | 'REJECTED'
  | 'APPEALED'
  | 'VERIFIED'
  | 'NOT_VERIFIED'
  | 'CANCELLED'
export type EvidenceTypeValue = 'LINK' | 'DOCUMENT' | 'NUMBER' | 'CLIENT_CONFIRMATION'
export type KpiScopeValue = 'TEAM' | 'DEPARTMENT'
export type KpiGrantRoleValue = 'VERIFIER' | 'DEPARTMENT_SETTER'

export interface PersonRef { id: string; name: string; position: string | null }

export interface MonthView {
  id: string | null
  monthKey: string
  goalsLockAt: string
  claimsDueAt: string
  verifyDueAt: string
  responseDueAt: string
  targetFinalAt: string
  locked: boolean
}

export interface KpiView {
  id: string
  goalId: string
  title: string
  target: string
  evidenceType: EvidenceTypeValue
  status: KpiStatusValue
  version: number
  owners: PersonRef[]
  claim: ClaimView | null
  decision: DecisionView | null
  files: EvidenceFileView[]
  appealUsed: boolean
  pendingChange: boolean
  actions: KpiActions
}

export interface GoalView {
  id: string
  scope: KpiScopeValue
  departmentKey: string | null
  departmentLabel: string | null
  setter: PersonRef
  title: string
  description: string | null
  kpis: KpiView[]
}

export interface Capabilities {
  inScheme: boolean
  isLeadOrJp: boolean
  isTeamSetter: boolean
  isDepartmentSetter: boolean
  isVerifier: boolean
  isHr: boolean
}

export interface MeResponse { enabled: boolean; capabilities?: Capabilities; departmentKey?: string; pending?: number }

export interface TeamViewResponse {
  month: MonthView
  setter: PersonRef | null
  team: PersonRef[]
  goals: GoalView[]
  setters?: PersonRef[]
}

export interface DepartmentOption { key: string; label: string; owners: PersonRef[] }

export interface DepartmentViewResponse {
  month: MonthView
  department: DepartmentOption
  departments: DepartmentOption[]
  goals: GoalView[]
  canEdit: boolean
  departmentsWithoutKpis: string[]
}

export interface MyKpi extends KpiView { monthKey: string; goalTitle: string; scope: KpiScopeValue }

export interface MonthPercent { monthKey: string; counted: number; verified: number; pending: number }

export interface PercentView {
  counted: number
  verified: number
  percent: number | null
  provisional: boolean
  months: MonthPercent[]
}

export interface MyViewResponse { quarterKey: string; months: MonthView[]; kpis: MyKpi[]; percent: PercentView }

export interface VerifierViewResponse { month: MonthView; goals: GoalView[] }

export interface AdminMonthRow extends Omit<MonthView, 'id'> { id: string; kpiCount: number }

export interface SetterAssignmentRow { id: string; employee: PersonRef; setter: PersonRef; reason: string; createdAt: string }

export interface SettersResponse {
  assignments: SetterAssignmentRow[]
  membersWithoutSetter: PersonRef[]
  /** Every in-scheme team member, so HR can replace anyone's default lead. */
  members: PersonRef[]
  people: PersonRef[]
}

export interface GrantRow { id: string; user: PersonRef; role: KpiGrantRoleValue; createdAt: string }

export interface GrantsResponse { grants: GrantRow[]; people: PersonRef[] }

export interface OverviewRow {
  person: PersonRef
  department: string | null
  kind: 'LEAD_JP' | 'MEMBER'
  setters: PersonRef[]
  percent: PercentView
}

export interface OverviewResponse {
  quarterKey: string
  rows: OverviewRow[]
  departmentsWithoutKpis: Array<{ monthKey: string; departments: string[] }>
}

export interface KpiActions { claim: boolean; respond: boolean; appeal: boolean; uploadEvidence: boolean; requestChange: boolean }
export interface EvidenceFileView { id: string; fileName: string; size: number; contentType: string }
export interface ClaimView { claimedBy: PersonRef; claimedAt: string; note: string | null; url: string | null; reportedValue: string | null }
export interface DecisionView { decidedAt: string; note: string | null }

export interface ChangeableFields { title: string; target: string; evidenceType: EvidenceTypeValue }

export type ChangeProposal =
  | { cancel: true }
  | { title?: string; target?: string; evidenceType?: EvidenceTypeValue; ownerIds?: string[] }

export interface ChangeRequestView {
  id: string
  kpiId: string
  kpiTitle: string
  monthKey: string
  requestedBy: PersonRef
  proposed: ChangeProposal
  /** The KPI as it is now, and as it was when it locked, so deciders see what the proposal changes. */
  current: ChangeableFields
  locked: ChangeableFields | null
  reason: string
  createdAt: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  decisionNote: string | null
  canDecide: boolean
}

export interface HistoryRow {
  id: string
  at: string
  actorName: string
  actorRole: string
  action: string
  fromStatus: string | null
  toStatus: string | null
  reason: string | null
}

export interface ClaimerStats { claims: number; rejections: number }

export interface VerificationQueueItem {
  kpiId: string
  version: number
  title: string
  target: string
  goalTitle: string
  monthKey: string
  scope: KpiScopeValue
  departmentLabel: string | null
  setter: PersonRef
  owners: PersonRef[]
  claimedBy: PersonRef | null
  claimedAt: string | null
  status: KpiStatusValue
  dueAt: string
  overdue: boolean
  canDecide: boolean
  claimerStats: ClaimerStats
  /** The setting lead's first-decision rejection rate over the last three months. */
  setterHistory: SetterRejectionView
}
export interface VerificationQueueResponse { items: VerificationQueueItem[] }

export interface KpiDetailResponse {
  kpi: KpiView & { monthKey: string; goalTitle: string; scope: KpiScopeValue; departmentLabel: string | null; setter: PersonRef }
  month: MonthView
  lockedSnapshot: { title: string; target: string; evidenceType: EvidenceTypeValue; owners: PersonRef[] } | null
  history: HistoryRow[]
  changeRequests: ChangeRequestView[]
  canDecide: boolean
  decidedBy: PersonRef | null
  claimerStats: ClaimerStats | null
}

export interface ResultsRow {
  kpiId: string
  version: number
  title: string
  goalTitle: string
  scope: KpiScopeValue
  departmentLabel: string | null
  setter: PersonRef
  owners: PersonRef[]
  status: KpiStatusValue
  claimedBy: PersonRef | null
  decisionNote: string | null
  final: boolean
}
export interface ResultsResponse {
  month: MonthView & { finalizedAt: string | null }
  rows: ResultsRow[]
  pending: { verification: number; changeRequests: number }
}

export interface AuditRow {
  id: string
  createdAt: string
  actorName: string
  actorRole: string
  action: string
  kpiId: string | null
  kpiTitle: string | null
  fromStatus: string | null
  toStatus: string | null
  reason: string | null
}

/** Spec 10.3: a lead's KPI claims over a window of months. */
export interface LeadClaimStats {
  locked: number
  claimedDone: number
  claimedNotDone: number
  verified: number
  needsInfo: number
  rejectedAtFirstDecision: number
  /** Claims with at least one verifier decision. */
  decided: number
  appealed: number
  finallyNotVerified: number
  /** claimed done ÷ locked */
  claimRate: number | null
  /** rejected at first decision ÷ claims decided */
  rejectionRate: number | null
  flagged: boolean
}
export interface LeadHistoryRow extends LeadClaimStats { lead: PersonRef }
export interface LeadHistoryResponse { fromMonth: string; toMonth: string; rows: LeadHistoryRow[] }
export interface SetterRejectionView { rejectionRate: number | null; decided: number; flagged: boolean }

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
}

export interface GoalView {
  id: string
  scope: KpiScopeValue
  departmentKey: string | null
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

export interface MeResponse { enabled: boolean; capabilities?: Capabilities; departmentKey?: string }

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

export interface SettersResponse { assignments: SetterAssignmentRow[]; membersWithoutSetter: PersonRef[]; people: PersonRef[] }

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

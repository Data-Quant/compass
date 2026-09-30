import { isThreeEDepartment } from '@/lib/company-branding'
import { normalizeDepartmentPoolKey } from '@/lib/dept-evaluation-pool'
import { shouldReceiveConstantEvaluations } from '@/lib/evaluation-profile-rules'
import { isLeadTitle } from '@/lib/pre-evaluation'

export interface ScopeUser {
  id: string
  name: string
  position: string | null
  department: string | null
  payrollActive: boolean
  exitDate: Date | null
}

export interface ScopeMapping { evaluatorId: string; evaluateeId: string; relationshipType: string }
export interface SetterAssignmentLike { employeeId: string; setterId: string }

export interface KpiScope {
  inScheme: ReadonlySet<string>
  /** In-scheme lead/JP title holders: measured only on department KPIs. */
  leadIds: ReadonlySet<string>
  /** Team members → effective team-KPI setters. */
  setterIdsByEmployee: ReadonlyMap<string, readonly string[]>
  /** Setter → team members they set KPIs for. */
  teamBySetter: ReadonlyMap<string, readonly string[]>
  /** Department key → in-scheme leads/JPs. */
  departmentOwners: ReadonlyMap<string, readonly string[]>
  /** In-scheme team members nobody sets KPIs for, sorted by name. */
  membersWithoutSetter: readonly string[]
}

export function isInScheme(user: ScopeUser): boolean {
  return user.payrollActive && shouldReceiveConstantEvaluations(user)
}

export function departmentKeyOf(department: string | null): string {
  return normalizeDepartmentPoolKey(department)
}

function uniqueSorted(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort()
}

function appendTo(map: Map<string, string[]>, key: string, value: string): void {
  map.set(key, [...(map.get(key) ?? []), value])
}

/** People HR can pick in KPI admin (setters, roles): active, and never 3E, which is outside the redesign. */
export function pickablePeople<T extends Pick<ScopeUser, 'payrollActive' | 'department'>>(users: Iterable<T>): T[] {
  return [...users].filter((user) => user.payrollActive && !isThreeEDepartment(user.department))
}

export function buildKpiScope(
  users: readonly ScopeUser[],
  mappings: readonly ScopeMapping[],
  assignments: readonly SetterAssignmentLike[],
): KpiScope {
  const byId = new Map(users.map((user) => [user.id, user]))
  const inScheme = new Set(users.filter(isInScheme).map((user) => user.id))
  const leadIds = new Set([...inScheme].filter((id) => isLeadTitle(byId.get(id)?.position ?? null)))

  const overrides = new Map<string, string[]>()
  for (const row of assignments) {
    // A setter who has left no longer counts, so their people surface as "without a setter".
    const setter = byId.get(row.setterId)
    if (row.setterId !== row.employeeId && setter?.payrollActive && !isThreeEDepartment(setter.department)) appendTo(overrides, row.employeeId, row.setterId)
  }

  const defaults = new Map<string, string[]>()
  for (const mapping of mappings) {
    if (mapping.relationshipType !== 'TEAM_LEAD' || mapping.evaluatorId === mapping.evaluateeId) continue
    const lead = byId.get(mapping.evaluatorId)
    if (lead?.payrollActive && isLeadTitle(lead.position) && !isThreeEDepartment(lead.department)) appendTo(defaults, mapping.evaluateeId, mapping.evaluatorId)
  }

  const setterIdsByEmployee = new Map<string, string[]>()
  const teams = new Map<string, string[]>()
  const withoutSetter: string[] = []
  for (const id of [...inScheme].filter((memberId) => !leadIds.has(memberId))) {
    const setters = uniqueSorted(overrides.get(id) ?? defaults.get(id) ?? [])
    setterIdsByEmployee.set(id, setters)
    if (setters.length === 0) withoutSetter.push(id)
    for (const setterId of setters) appendTo(teams, setterId, id)
  }

  const departments = new Map<string, string[]>()
  for (const id of leadIds) appendTo(departments, departmentKeyOf(byId.get(id)?.department ?? null), id)

  const nameOf = (id: string) => byId.get(id)?.name ?? id
  return {
    inScheme,
    leadIds,
    setterIdsByEmployee,
    teamBySetter: new Map([...teams].map(([key, ids]) => [key, uniqueSorted(ids)])),
    departmentOwners: new Map([...departments].map(([key, ids]) => [key, uniqueSorted(ids)])),
    membersWithoutSetter: [...withoutSetter].sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
  }
}

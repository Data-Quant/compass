import type { AppUserRole } from '@/lib/permissions'
import type { KpiScope } from './scope'
import type { KpiGrantRoleValue, KpiScopeValue } from './view-types'

export interface KpiActor {
  id: string
  role: AppUserRole
  position: string | null
  departmentKey: string
  grants: readonly KpiGrantRoleValue[]
}

export interface GoalRef { scope: KpiScopeValue; setterId: string; departmentKey: string | null }
export interface KpiRef extends GoalRef { assigneeIds: readonly string[]; claimedById: string | null }

const DEPARTMENT_SETTER_TITLES: ReadonlySet<string> = new Set(['partner', 'managing partner'])

function normalizedTitle(position: string | null): string {
  return (position ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function isHr(actor: KpiActor): boolean {
  return actor.role === 'HR'
}

export function isDepartmentSetter(actor: KpiActor): boolean {
  return isHr(actor) || DEPARTMENT_SETTER_TITLES.has(normalizedTitle(actor.position)) || actor.grants.includes('DEPARTMENT_SETTER')
}

export function isVerifierEligible(actor: KpiActor): boolean {
  return isHr(actor) || actor.role === 'EXECUTION' || actor.grants.includes('VERIFIER')
}

export function isTeamSetter(actor: KpiActor, scope: KpiScope): boolean {
  return (scope.teamBySetter.get(actor.id)?.length ?? 0) > 0
}

export function canManageTeamGoalsFor(actor: KpiActor, setterId: string, scope: KpiScope): boolean {
  return (scope.teamBySetter.get(setterId)?.length ?? 0) > 0 && (actor.id === setterId || isHr(actor))
}

export function canEditGoal(actor: KpiActor, goal: GoalRef): boolean {
  return goal.scope === 'TEAM' ? actor.id === goal.setterId || isHr(actor) : isDepartmentSetter(actor)
}

export function ownerError(goal: GoalRef, ownerIds: readonly string[], scope: KpiScope): string | null {
  if (ownerIds.length === 0) return 'Choose at least one owner'
  if (new Set(ownerIds).size !== ownerIds.length) return 'Owners must be unique'
  if (goal.scope === 'TEAM') {
    const team = scope.teamBySetter.get(goal.setterId) ?? []
    return ownerIds.every((id) => team.includes(id)) ? null : 'Owners must be members of the setter’s team'
  }
  const owners = scope.departmentOwners.get(goal.departmentKey ?? '') ?? []
  return ownerIds.every((id) => owners.includes(id)) ? null : 'Owners must be leads or JPs of this department'
}

export function canViewDepartment(actor: KpiActor, departmentKey: string, scope: KpiScope): boolean {
  return (
    isHr(actor) ||
    isVerifierEligible(actor) ||
    isDepartmentSetter(actor) ||
    (scope.leadIds.has(actor.id) && actor.departmentKey === departmentKey)
  )
}

export function canViewKpi(actor: KpiActor, kpi: KpiRef, scope: KpiScope): boolean {
  if (kpi.assigneeIds.includes(actor.id)) return true
  if (kpi.scope === 'TEAM') return actor.id === kpi.setterId || isHr(actor) || isVerifierEligible(actor)
  return canViewDepartment(actor, kpi.departmentKey ?? '', scope)
}

export function canClaim(actor: KpiActor, kpi: KpiRef): boolean {
  if (isHr(actor)) return true
  return kpi.scope === 'TEAM' ? actor.id === kpi.setterId : kpi.assigneeIds.includes(actor.id)
}

export function canVerify(actor: KpiActor, kpi: KpiRef): boolean {
  return (
    isVerifierEligible(actor) &&
    !kpi.assigneeIds.includes(actor.id) &&
    actor.id !== kpi.setterId &&
    actor.id !== kpi.claimedById
  )
}

export function canRequestChange(actor: KpiActor, kpi: KpiRef): boolean {
  return canClaim(actor, kpi) || (kpi.scope === 'DEPARTMENT' && isDepartmentSetter(actor))
}

export function canDecideChange(actor: KpiActor, kpi: KpiRef, requestedById: string): boolean {
  return (
    isVerifierEligible(actor) &&
    actor.id !== requestedById &&
    !kpi.assigneeIds.includes(actor.id) &&
    actor.id !== kpi.setterId
  )
}

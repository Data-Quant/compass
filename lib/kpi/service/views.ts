import type { KpiStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { formatMonthKey, formatQuarterKey, parseMonthKey, parseQuarterKey, quarterMonths } from '../calendar'
import { computeKpiPercent } from '../kpi-percent'
import { canViewDepartment, isDepartmentSetter, isHr, isTeamSetter, isVerifierEligible, type KpiActor } from '../permissions'
import { departmentKeyOf, type KpiScope } from '../scope'
import { effectiveStatus, type MonthDeadlinesLike } from '../state-machine'
import type {
  Capabilities, DepartmentOption, DepartmentViewResponse, EvidenceTypeValue, GoalView, KpiStatusValue, KpiView, MyKpi, MyViewResponse,
  TeamViewResponse, VerifierViewResponse,
} from '../view-types'
import { byName, departmentLabel, loadKpiContext, personRef, type KpiContext } from './context'
import { KpiError } from './errors'
import { resolveMonth, toMonthView, type ResolvedMonth } from './months'

// Compile-time guard: the client-safe status union must equal the Prisma enum.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never
const statusUnionMatches: Same<KpiStatus, KpiStatusValue> = true
void statusUnionMatches

const goalInclude = { kpis: { include: { assignees: true }, orderBy: { createdAt: 'asc' } } } as const satisfies Prisma.KpiGoalInclude

interface KpiRowLike {
  id: string
  title: string
  target: string
  evidenceType: EvidenceTypeValue
  status: KpiStatusValue
  version: number
  lockedSnapshot: unknown
  assignees: Array<{ userId: string }>
}
interface GoalRowLike {
  id: string
  scope: 'TEAM' | 'DEPARTMENT'
  departmentKey: string | null
  setterId: string
  title: string
  description: string | null
  kpis: KpiRowLike[]
}

/** Discarded drafts are hidden everywhere; cancellations after lock stay visible. */
export function isVisibleKpi(kpi: { status: string; lockedSnapshot: unknown }): boolean {
  return !(kpi.status === 'CANCELLED' && kpi.lockedSnapshot === null)
}

function toKpiView(ctx: KpiContext, goalId: string, kpi: KpiRowLike, month: MonthDeadlinesLike, now: Date): KpiView {
  return {
    id: kpi.id,
    goalId,
    title: kpi.title,
    target: kpi.target,
    evidenceType: kpi.evidenceType,
    status: effectiveStatus(kpi.status, month, now),
    version: kpi.version,
    owners: kpi.assignees.map((assignee) => personRef(ctx, assignee.userId)).sort(byName),
  }
}

function toGoalView(ctx: KpiContext, goal: GoalRowLike, month: MonthDeadlinesLike, now: Date): GoalView {
  return {
    id: goal.id,
    scope: goal.scope,
    departmentKey: goal.departmentKey,
    setter: personRef(ctx, goal.setterId),
    title: goal.title,
    description: goal.description,
    kpis: goal.kpis.filter(isVisibleKpi).map((kpi) => toKpiView(ctx, goal.id, kpi, month, now)),
  }
}

function requireMonthKey(value: string) {
  const key = parseMonthKey(value)
  if (!key) throw new KpiError('Use a YYYY-MM month')
  return key
}

async function goalsFor(month: ResolvedMonth, where: Prisma.KpiGoalWhereInput) {
  if (!month.id) return []
  return prisma.kpiGoal.findMany({ where: { ...where, kpiMonthId: month.id, archivedAt: null }, include: goalInclude, orderBy: { createdAt: 'asc' } })
}

export function capabilitiesOf(actor: KpiActor, scope: KpiScope): Capabilities {
  return {
    inScheme: scope.inScheme.has(actor.id),
    isLeadOrJp: scope.leadIds.has(actor.id),
    isTeamSetter: isTeamSetter(actor, scope),
    isDepartmentSetter: isDepartmentSetter(actor),
    isVerifier: isVerifierEligible(actor),
    isHr: isHr(actor),
  }
}

export async function teamView(actor: KpiActor, monthKey: string, requestedSetterId: string | null, now: Date = new Date()): Promise<TeamViewResponse> {
  const key = requireMonthKey(monthKey)
  const ctx = await loadKpiContext()
  const setterId = requestedSetterId ?? (ctx.scope.teamBySetter.has(actor.id) ? actor.id : null)
  if (setterId && setterId !== actor.id && !isHr(actor)) throw new KpiError('You can only open your own team', 403)
  if (!setterId && !isHr(actor)) throw new KpiError('You have no team to set KPIs for', 403)
  const month = await resolveMonth(key)
  const goals = setterId ? await goalsFor(month, { scope: 'TEAM', setterId }) : []
  return {
    month: toMonthView(month, now),
    setter: setterId ? personRef(ctx, setterId) : null,
    team: (setterId ? ctx.scope.teamBySetter.get(setterId) ?? [] : []).map((id) => personRef(ctx, id)).sort(byName),
    goals: goals.map((goal) => toGoalView(ctx, goal, month, now)),
    ...(isHr(actor) ? { setters: [...ctx.scope.teamBySetter.keys()].map((id) => personRef(ctx, id)).sort(byName) } : {}),
  }
}

export async function departmentView(actor: KpiActor, monthKey: string, requestedKey: string | null, now: Date = new Date()): Promise<DepartmentViewResponse> {
  const key = requireMonthKey(monthKey)
  const ctx = await loadKpiContext()
  const departments: DepartmentOption[] = [...ctx.scope.departmentOwners.entries()]
    .map(([departmentKey, ownerIds]) => ({
      key: departmentKey,
      label: departmentLabel(ctx, departmentKey),
      owners: ownerIds.map((id) => personRef(ctx, id)).sort(byName),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const departmentKey = requestedKey ? departmentKeyOf(requestedKey) : ctx.scope.leadIds.has(actor.id) ? actor.departmentKey : departments[0]?.key
  const department = departments.find((option) => option.key === departmentKey)
  if (!department) throw new KpiError('This department has no leads or JPs in the scheme', 404)
  if (!canViewDepartment(actor, department.key, ctx.scope)) throw new KpiError('You cannot view this department’s KPIs', 403)
  const month = await resolveMonth(key)
  const goals = await goalsFor(month, { scope: 'DEPARTMENT', departmentKey: department.key })
  const seesAll = isHr(actor) || isVerifierEligible(actor) || isDepartmentSetter(actor)
  return {
    month: toMonthView(month, now),
    department,
    departments: seesAll ? departments : [department],
    goals: goals.map((goal) => toGoalView(ctx, goal, month, now)),
    canEdit: isDepartmentSetter(actor),
  }
}

export async function myView(actor: KpiActor, quarterKey: string, now: Date = new Date()): Promise<MyViewResponse> {
  const quarter = parseQuarterKey(quarterKey)
  if (!quarter) throw new KpiError('Use a YYYY-Qn quarter')
  const ctx = await loadKpiContext()
  const keys = quarterMonths(quarter)
  const months = await Promise.all(keys.map((key) => resolveMonth(key)))
  const monthById = new Map(months.flatMap((month) => (month.id ? [[month.id, month] as const] : [])))
  const rows = monthById.size
    ? await prisma.kpi.findMany({
        where: { assignees: { some: { userId: actor.id } }, goal: { kpiMonthId: { in: [...monthById.keys()] }, archivedAt: null } },
        include: { assignees: true, goal: true },
        orderBy: { createdAt: 'asc' },
      })
    : []
  const kpis: MyKpi[] = rows.filter(isVisibleKpi).flatMap((row) => {
    const month = monthById.get(row.goal.kpiMonthId)
    if (!month) return []
    return [{ ...toKpiView(ctx, row.goalId, row, month, now), monthKey: formatMonthKey(month), goalTitle: row.goal.title, scope: row.goal.scope }]
  })
  const percent = computeKpiPercent(
    actor.id,
    keys.map(formatMonthKey),
    kpis.map((kpi) => ({ monthKey: kpi.monthKey, status: kpi.status, assigneeIds: kpi.owners.map((owner) => owner.id) })),
    ctx.usersById.get(actor.id)?.exitDate ?? null,
  )
  return { quarterKey: formatQuarterKey(quarter), months: months.map((month) => toMonthView(month, now)), kpis, percent }
}

export async function verifierView(actor: KpiActor, monthKey: string, now: Date = new Date()): Promise<VerifierViewResponse> {
  if (!isVerifierEligible(actor)) throw new KpiError('Verifier access required', 403)
  const key = requireMonthKey(monthKey)
  const ctx = await loadKpiContext()
  const month = await resolveMonth(key)
  const goals = await goalsFor(month, {})
  return { month: toMonthView(month, now), goals: goals.map((goal) => toGoalView(ctx, goal, month, now)) }
}

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { formatMonthKey, formatQuarterKey, parseQuarterKey, quarterMonths } from '../calendar'
import { computeKpiPercent } from '../kpi-percent'
import type { KpiActor } from '../permissions'
import { effectiveStatus } from '../state-machine'
import type { AdminMonthRow, GrantsResponse, KpiGrantRoleValue, OverviewResponse, OverviewRow, SettersResponse } from '../view-types'
import { byName, departmentLabel, loadKpiContext, personRef } from './context'
import { KpiError } from './errors'
import { recordEvent } from './events'
import { resolveMonth, toMonthView } from './months'
import { isVisibleKpi } from './views'

function assertHr(actor: KpiActor): void {
  if (actor.role !== 'HR') throw new KpiError('HR access required', 403)
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export async function listAdminMonths(now: Date = new Date()): Promise<AdminMonthRow[]> {
  const months = await prisma.kpiMonth.findMany({
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    include: { goals: { where: { archivedAt: null }, select: { kpis: { select: { status: true, lockedSnapshot: true } } } } },
  })
  return months.map((month) => ({
    ...toMonthView(month, now),
    id: month.id,
    kpiCount: month.goals.flatMap((goal) => goal.kpis).filter(isVisibleKpi).length,
  }))
}

export async function settersOverview(): Promise<SettersResponse> {
  const ctx = await loadKpiContext()
  const rows = await prisma.kpiSetterAssignment.findMany({ orderBy: { createdAt: 'asc' } })
  return {
    assignments: rows.map((row) => ({
      id: row.id, employee: personRef(ctx, row.employeeId), setter: personRef(ctx, row.setterId), reason: row.reason, createdAt: row.createdAt.toISOString(),
    })),
    membersWithoutSetter: ctx.scope.membersWithoutSetter.map((id) => personRef(ctx, id)),
    people: [...ctx.usersById.values()].filter((user) => user.payrollActive).map((user) => personRef(ctx, user.id)).sort(byName),
  }
}

export async function addSetterAssignment(actor: KpiActor, input: { employeeId: string; setterId: string; reason: string }): Promise<void> {
  assertHr(actor)
  const ctx = await loadKpiContext()
  if (input.employeeId === input.setterId) throw new KpiError('A person cannot set their own KPIs')
  if (!ctx.scope.inScheme.has(input.employeeId) || ctx.scope.leadIds.has(input.employeeId)) {
    throw new KpiError('Only team members in the scheme get a team-KPI setter; leads and JPs have department KPIs')
  }
  if (!ctx.usersById.get(input.setterId)?.payrollActive) throw new KpiError('Choose an active setter')
  try {
    await prisma.$transaction(async (tx) => {
      const row = await tx.kpiSetterAssignment.create({ data: { ...input, createdById: actor.id } })
      await recordEvent(tx, { actorId: actor.id, actorRole: actor.role, action: 'SETTER_ADD', after: { id: row.id, employeeId: row.employeeId, setterId: row.setterId }, reason: input.reason })
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new KpiError('That setter is already assigned to this person', 409)
    throw error
  }
}

export async function removeSetterAssignment(actor: KpiActor, id: string, reason: string): Promise<void> {
  assertHr(actor)
  await prisma.$transaction(async (tx) => {
    const row = await tx.kpiSetterAssignment.findUnique({ where: { id } })
    if (!row) throw new KpiError('Assignment not found', 404)
    await tx.kpiSetterAssignment.delete({ where: { id } })
    await recordEvent(tx, { actorId: actor.id, actorRole: actor.role, action: 'SETTER_REMOVE', before: { id, employeeId: row.employeeId, setterId: row.setterId }, reason })
  })
}

export async function grantsOverview(): Promise<GrantsResponse> {
  const ctx = await loadKpiContext()
  const grants = await prisma.kpiRoleGrant.findMany({ orderBy: { createdAt: 'asc' } })
  return {
    grants: grants.map((grant) => ({ id: grant.id, user: personRef(ctx, grant.userId), role: grant.role, createdAt: grant.createdAt.toISOString() })),
    people: [...ctx.usersById.values()].filter((user) => user.payrollActive).map((user) => personRef(ctx, user.id)).sort(byName),
  }
}

export async function addGrant(actor: KpiActor, input: { userId: string; role: KpiGrantRoleValue }): Promise<void> {
  assertHr(actor)
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } })
  if (!user) throw new KpiError('Person not found', 404)
  try {
    await prisma.$transaction(async (tx) => {
      const grant = await tx.kpiRoleGrant.create({ data: { ...input, createdById: actor.id } })
      await recordEvent(tx, { actorId: actor.id, actorRole: actor.role, action: 'GRANT_ADD', after: { id: grant.id, userId: grant.userId, role: grant.role } })
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new KpiError('This person already has that role', 409)
    throw error
  }
}

export async function removeGrant(actor: KpiActor, id: string): Promise<void> {
  assertHr(actor)
  await prisma.$transaction(async (tx) => {
    const grant = await tx.kpiRoleGrant.findUnique({ where: { id } })
    if (!grant) throw new KpiError('Grant not found', 404)
    await tx.kpiRoleGrant.delete({ where: { id } })
    await recordEvent(tx, { actorId: actor.id, actorRole: actor.role, action: 'GRANT_REMOVE', before: { id, userId: grant.userId, role: grant.role } })
  })
}

export async function quarterOverview(quarterKey: string, now: Date = new Date()): Promise<OverviewResponse> {
  const quarter = parseQuarterKey(quarterKey)
  if (!quarter) throw new KpiError('Use a YYYY-Qn quarter')
  const ctx = await loadKpiContext()
  const keys = quarterMonths(quarter)
  const months = await Promise.all(keys.map((key) => resolveMonth(key)))
  const monthById = new Map(months.flatMap((month) => (month.id ? [[month.id, month] as const] : [])))
  const goals = monthById.size
    ? await prisma.kpiGoal.findMany({ where: { kpiMonthId: { in: [...monthById.keys()] }, archivedAt: null }, include: { kpis: { include: { assignees: true } } } })
    : []
  const percentKpis = goals.flatMap((goal) => {
    const month = monthById.get(goal.kpiMonthId)
    if (!month) return []
    return goal.kpis.filter(isVisibleKpi).map((kpi) => ({
      monthKey: formatMonthKey(month),
      status: effectiveStatus(kpi.status, month, now),
      assigneeIds: kpi.assignees.map((assignee) => assignee.userId),
    }))
  })
  const monthKeys = keys.map(formatMonthKey)
  const rows: OverviewRow[] = [...ctx.scope.inScheme]
    .map((id) => {
      const user = ctx.usersById.get(id)
      return {
        person: personRef(ctx, id),
        department: user?.department ?? null,
        kind: ctx.scope.leadIds.has(id) ? ('LEAD_JP' as const) : ('MEMBER' as const),
        setters: (ctx.scope.setterIdsByEmployee.get(id) ?? []).map((setterId) => personRef(ctx, setterId)),
        percent: computeKpiPercent(id, monthKeys, percentKpis, user?.exitDate ?? null),
      }
    })
    .sort((a, b) => byName(a.person, b.person))
  const departmentsWithoutKpis = months.map((month) => {
    const covered = new Set(
      goals.filter((goal) => goal.kpiMonthId === month.id && goal.scope === 'DEPARTMENT' && goal.kpis.some(isVisibleKpi)).map((goal) => goal.departmentKey),
    )
    return {
      monthKey: formatMonthKey(month),
      departments: [...ctx.scope.departmentOwners.keys()].filter((key) => !covered.has(key)).map((key) => departmentLabel(ctx, key)).sort(),
    }
  })
  return { quarterKey: formatQuarterKey(quarter), rows, departmentsWithoutKpis }
}

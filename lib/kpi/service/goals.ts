import { prisma } from '@/lib/db'
import { parseDueDate } from '../deadline'
import { parseMonthKey } from '../calendar'
import { canEditGoal, canManageTeamGoalsFor, isDepartmentSetter, ownerError, type GoalRef, type KpiActor } from '../permissions'
import type { CreateGoalInput, CreateKpiInput, UpdateGoalInput, UpdateKpiInput } from '../schemas'
import { departmentKeyOf } from '../scope'
import { transition } from '../state-machine'
import type { KpiStatusValue } from '../view-types'
import { loadKpiContext } from './context'
import { KpiError } from './errors'
import { eventRole, recordEvent, setterCapability } from './events'
import { ensureMonth, resolveMonth } from './months'
import { persistSystemTransitions } from './system'

const LOCKED_MESSAGE = 'KPIs for this month are locked'
const STALE_MESSAGE = 'This KPI changed since you opened it; reload and try again'

function goalRef(goal: GoalRef): GoalRef {
  return { scope: goal.scope, setterId: goal.setterId, departmentKey: goal.departmentKey }
}

/** Discarded drafts (cancelled before lock) don't count as live KPIs. */
function isLiveKpi(kpi: { status: string; lockedSnapshot: unknown }): boolean {
  return !(kpi.status === 'CANCELLED' && kpi.lockedSnapshot === null)
}

export async function createGoal(actor: KpiActor, input: CreateGoalInput, now: Date = new Date()) {
  const key = parseMonthKey(input.monthKey)
  if (!key) throw new KpiError('Use a YYYY-MM month')
  const { scope } = await loadKpiContext()
  let setterId: string
  let departmentKey: string | null = null
  if (input.scope === 'TEAM') {
    setterId = input.setterId ?? actor.id
    if (!canManageTeamGoalsFor(actor, setterId, scope)) throw new KpiError('You cannot set team KPIs for this person', 403)
  } else {
    if (!isDepartmentSetter(actor)) throw new KpiError('Only Partners and HR set department KPIs', 403)
    departmentKey = departmentKeyOf(input.departmentKey ?? null)
    if (!scope.departmentOwners.has(departmentKey)) throw new KpiError('This department has no leads or JPs in the scheme')
    setterId = actor.id
  }
  // Check the lock before creating the month, so a refused goal leaves no empty month behind.
  if (now > (await resolveMonth(key)).goalsLockAt) throw new KpiError(LOCKED_MESSAGE, 409)
  const month = await ensureMonth(key)
  if (now > month.goalsLockAt) throw new KpiError(LOCKED_MESSAGE, 409)
  return prisma.$transaction(async (tx) => {
    const goal = await tx.kpiGoal.create({
      data: { kpiMonthId: month.id, scope: input.scope, departmentKey, setterId, title: input.title, description: input.description ?? null },
    })
    await recordEvent(tx, {
      kpiMonthId: month.id, actorId: actor.id, actorRole: eventRole(actor, setterCapability(input.scope)), action: 'GOAL_CREATE',
      after: { goalId: goal.id, scope: goal.scope, departmentKey, setterId, title: goal.title, description: goal.description },
    })
    return goal
  })
}

async function loadGoal(goalId: string) {
  const goal = await prisma.kpiGoal.findUnique({
    where: { id: goalId },
    include: { kpiMonth: true, kpis: { select: { status: true, lockedSnapshot: true } } },
  })
  if (!goal || goal.archivedAt) throw new KpiError('Goal not found', 404)
  return goal
}

export async function updateGoal(actor: KpiActor, goalId: string, input: UpdateGoalInput, now: Date = new Date()) {
  const goal = await loadGoal(goalId)
  if (!canEditGoal(actor, goalRef(goal))) throw new KpiError('You cannot change this goal', 403)
  if (now > goal.kpiMonth.goalsLockAt) throw new KpiError(LOCKED_MESSAGE, 409)
  if (input.action === 'archive' && goal.kpis.some(isLiveKpi)) {
    throw new KpiError('Discard this goal’s KPIs before removing it', 409)
  }
  const data =
    input.action === 'archive'
      ? { archivedAt: now }
      : {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.kpiGoal.update({ where: { id: goal.id }, data })
    await recordEvent(tx, {
      kpiMonthId: goal.kpiMonthId, actorId: actor.id, actorRole: eventRole(actor, setterCapability(goal.scope)),
      action: input.action === 'archive' ? 'GOAL_ARCHIVE' : 'GOAL_EDIT',
      before: { title: goal.title, description: goal.description },
      after: { title: updated.title, description: updated.description, archivedAt: updated.archivedAt },
    })
    return updated
  })
}

export async function createKpi(actor: KpiActor, input: CreateKpiInput, now: Date = new Date()) {
  const goal = await loadGoal(input.goalId)
  if (!canEditGoal(actor, goalRef(goal))) throw new KpiError('You cannot add KPIs to this goal', 403)
  if (now > goal.kpiMonth.goalsLockAt) throw new KpiError(LOCKED_MESSAGE, 409)
  const { scope } = await loadKpiContext()
  const problem = ownerError(goalRef(goal), input.ownerIds, scope)
  if (problem) throw new KpiError(problem)
  const dueDate = parseDueDate(input.dueDate, goal.kpiMonth)
  return prisma.$transaction(async (tx) => {
    const kpi = await tx.kpi.create({
      data: {
        goalId: goal.id, title: input.title, target: input.target, evidenceType: input.evidenceType, dueDate,
        assignees: { create: input.ownerIds.map((userId) => ({ userId })) },
      },
    })
    await recordEvent(tx, {
      kpiId: kpi.id, kpiMonthId: goal.kpiMonthId, actorId: actor.id, actorRole: eventRole(actor, setterCapability(goal.scope)),
      action: 'KPI_CREATE', toStatus: 'DRAFT',
      after: { title: input.title, target: input.target, evidenceType: input.evidenceType, assigneeIds: [...input.ownerIds].sort(), dueDate: dueDate.toISOString() },
    })
    return kpi
  })
}

export async function updateKpi(
  actor: KpiActor,
  kpiId: string,
  input: UpdateKpiInput,
  now: Date = new Date(),
): Promise<{ id: string; status: KpiStatusValue; version: number }> {
  // Authorize first: someone who cannot edit must not be able to force a lock to be saved.
  const existing = await prisma.kpi.findUnique({ where: { id: kpiId }, include: { goal: true } })
  if (!existing || existing.goal.archivedAt) throw new KpiError('KPI not found', 404)
  if (!canEditGoal(actor, goalRef(existing.goal))) throw new KpiError('You cannot change this KPI', 403)
  await persistSystemTransitions({ id: kpiId }, now)
  const kpi = await prisma.kpi.findUniqueOrThrow({ where: { id: kpiId }, include: { goal: { include: { kpiMonth: true } }, assignees: true } })
  if (kpi.version !== input.version && kpi.status === 'DRAFT') throw new KpiError(STALE_MESSAGE, 409)
  const result = transition(
    { status: kpi.status, appealUsedAt: kpi.appealUsedAt, decidedById: kpi.decidedById },
    { type: input.action === 'edit' ? 'EDIT' : 'DISCARD' },
    kpi.goal.kpiMonth,
    now,
  )
  if (!result.ok) throw new KpiError(result.error, 409)
  if (input.action === 'edit' && input.ownerIds) {
    if (new Set(input.ownerIds).size !== input.ownerIds.length) throw new KpiError('Owners must be unique')
    // Only newly added owners must be in the team: an owner who has since left can be kept or removed.
    const currentIds = kpi.assignees.map((assignee) => assignee.userId)
    const added = input.ownerIds.filter((id) => !currentIds.includes(id))
    if (added.length > 0) {
      const { scope } = await loadKpiContext()
      const problem = ownerError(goalRef(kpi.goal), added, scope)
      if (problem) throw new KpiError(problem)
    }
  }
  const dueDate = input.action === 'edit' && input.dueDate !== undefined ? parseDueDate(input.dueDate, kpi.goal.kpiMonth) : kpi.dueDate
  const before = {
    title: kpi.title, target: kpi.target, evidenceType: kpi.evidenceType,
    assigneeIds: kpi.assignees.map((assignee) => assignee.userId).sort(), dueDate: kpi.dueDate?.toISOString() ?? null,
  }
  const after =
    input.action === 'discard'
      ? before
      : {
          title: input.title ?? kpi.title,
          target: input.target ?? kpi.target,
          evidenceType: input.evidenceType ?? kpi.evidenceType,
          assigneeIds: [...(input.ownerIds ?? before.assigneeIds)].sort(),
          dueDate: dueDate?.toISOString() ?? null,
        }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.kpi.updateMany({
      where: { id: kpi.id, version: input.version },
      data:
        input.action === 'discard'
          ? { status: 'CANCELLED', version: { increment: 1 } }
          : { title: after.title, target: after.target, evidenceType: after.evidenceType, dueDate, version: { increment: 1 } },
    })
    if (updated.count === 0) throw new KpiError(STALE_MESSAGE, 409)
    if (input.action === 'edit' && input.ownerIds) {
      await tx.kpiAssignee.deleteMany({ where: { kpiId: kpi.id } })
      await tx.kpiAssignee.createMany({ data: input.ownerIds.map((userId) => ({ kpiId: kpi.id, userId })) })
    }
    await recordEvent(tx, {
      kpiId: kpi.id, kpiMonthId: kpi.goal.kpiMonthId, actorId: actor.id, actorRole: eventRole(actor, setterCapability(kpi.goal.scope)),
      action: input.action === 'discard' ? 'KPI_DISCARD' : 'KPI_EDIT',
      fromStatus: kpi.status, toStatus: result.to, before, after,
    })
    return { id: kpi.id, status: result.to, version: kpi.version + 1 }
  })
}

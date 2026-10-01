import type { WeeklyCycle } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { effectiveWeek, parseWeekOneMonday, questionWeekCount, totalWeeks } from '../calendar'
import { evaluateeExclusion, isOutsideRedesign } from '../eligibility'
import { isWeeklyRelationshipType } from '../perspectives'
import type { CreateCycleInput, UpdateCycleInput } from '../schemas'
import type { AdminCyclesResponse, CycleSummary, ParticipantsResponse } from '../view-types'
import { recordAudit } from './audit'
import { readyCompetencyCount } from './content'
import { assertHr, byName, loadPeople, personRef, type WeeklyActor } from './context'
import { isUniqueViolation, type Db } from './db'
import { WeeklyError } from './errors'

export interface CycleWithPeriod extends WeeklyCycle {
  period: { id: string; name: string; startDate: Date; endDate: Date }
}

const MIN_WEEKS = 3

export async function loadCycle(cycleId: string, db: Db = prisma): Promise<CycleWithPeriod> {
  const cycle = await db.weeklyCycle.findUnique({ where: { id: cycleId } })
  if (!cycle) throw new WeeklyError('Weekly cycle not found', 404)
  const period = await db.evaluationPeriod.findUnique({ where: { id: cycle.periodId }, select: { id: true, name: true, startDate: true, endDate: true } })
  if (!period) throw new WeeklyError('The evaluation period for this cycle no longer exists', 404)
  return { ...cycle, period }
}

export function cycleSummary(cycle: CycleWithPeriod, now: Date): CycleSummary {
  const total = totalWeeks(cycle.weekOneStartsOn, cycle.period.endDate)
  return {
    id: cycle.id, periodId: cycle.periodId, periodName: cycle.period.name, status: cycle.status,
    weekOneStartsOn: cycle.weekOneStartsOn.toISOString(), weeklyCap: cycle.weeklyCap,
    totalWeeks: total, questionWeeks: questionWeekCount(total),
    currentWeek: Math.min(total, effectiveWeek(cycle.weekOneStartsOn, cycle.simulatedWeek, now)),
    simulatedWeek: cycle.simulatedWeek,
  }
}

/** At most one cycle runs at a time (enforced when starting). */
export async function findRunningCycle(db: Db = prisma): Promise<CycleWithPeriod | null> {
  const cycle = await db.weeklyCycle.findFirst({ where: { status: 'RUNNING' }, orderBy: { weekOneStartsOn: 'desc' } })
  return cycle ? loadCycle(cycle.id, db) : null
}

export async function adminCycles(actor: WeeklyActor, now: Date): Promise<AdminCyclesResponse> {
  assertHr(actor)
  const [periods, cycles] = await Promise.all([
    prisma.evaluationPeriod.findMany({ orderBy: { startDate: 'desc' }, select: { id: true, name: true, startDate: true, endDate: true, isActive: true, isLocked: true } }),
    prisma.weeklyCycle.findMany({ orderBy: { weekOneStartsOn: 'desc' } }),
  ])
  const cycleByPeriod = new Map(cycles.map((c) => [c.periodId, c.id]))
  const summaries = await Promise.all(cycles.map(async (c) => cycleSummary(await loadCycle(c.id), now)))
  return {
    periods: periods.map((p) => ({
      id: p.id, name: p.name, startDate: p.startDate.toISOString(), endDate: p.endDate.toISOString(),
      isActive: p.isActive, isLocked: p.isLocked, cycleId: cycleByPeriod.get(p.id) ?? null,
    })),
    cycles: summaries,
  }
}

function checkWeekOne(value: string, periodEnd: Date): Date {
  const weekOne = parseWeekOneMonday(value)
  if (!weekOne) throw new WeeklyError('Week 1 must start on a Monday')
  if (weekOne > periodEnd || totalWeeks(weekOne, periodEnd) < MIN_WEEKS) throw new WeeklyError('Week 1 must leave at least three weeks before the period ends')
  return weekOne
}

export async function createCycle(actor: WeeklyActor, input: CreateCycleInput): Promise<WeeklyCycle> {
  assertHr(actor)
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: input.periodId } })
  if (!period) throw new WeeklyError('Evaluation period not found', 404)
  if (period.isLocked) throw new WeeklyError('This period is locked', 409)
  const weekOneStartsOn = checkWeekOne(input.weekOneStartsOn, period.endDate)
  try {
    return await prisma.$transaction(async (tx) => {
      const cycle = await tx.weeklyCycle.create({ data: { periodId: period.id, weekOneStartsOn, weeklyCap: input.weeklyCap, createdById: actor.id } })
      await recordAudit(tx, {
        cycleId: cycle.id, actorId: actor.id, actorRole: 'HR', action: 'CYCLE_CREATE', objectType: 'WeeklyCycle', objectId: cycle.id,
        after: { periodId: period.id, weekOneStartsOn: input.weekOneStartsOn, weeklyCap: input.weeklyCap },
      })
      return cycle
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new WeeklyError('This period already runs on weekly evaluations', 409)
    throw error
  }
}

export async function updateCycle(actor: WeeklyActor, cycleId: string, input: UpdateCycleInput): Promise<WeeklyCycle> {
  assertHr(actor)
  const cycle = await loadCycle(cycleId)
  if (cycle.status !== 'SETUP') {
    throw new WeeklyError(input.action === 'start' ? 'Only a cycle in setup can start' : 'Week 1 and the weekly cap can only change before the cycle starts', 409)
  }
  if (input.action === 'start') {
    if ((await prisma.weeklyCycle.count({ where: { status: 'RUNNING' } })) > 0) throw new WeeklyError('Another weekly cycle is already running', 409)
    if ((await readyCompetencyCount()) === 0) throw new WeeklyError('Approve at least one topic profile before starting', 409)
    return prisma.$transaction(async (tx) => {
      const started = await tx.weeklyCycle.update({ where: { id: cycle.id }, data: { status: 'RUNNING' } })
      await recordAudit(tx, { cycleId: cycle.id, actorId: actor.id, actorRole: 'HR', action: 'CYCLE_START', objectType: 'WeeklyCycle', objectId: cycle.id })
      return started
    })
  }
  const weekOneStartsOn = input.weekOneStartsOn ? checkWeekOne(input.weekOneStartsOn, cycle.period.endDate) : undefined
  return prisma.$transaction(async (tx) => {
    const updated = await tx.weeklyCycle.update({
      where: { id: cycle.id },
      data: { ...(weekOneStartsOn ? { weekOneStartsOn } : {}), ...(input.weeklyCap !== undefined ? { weeklyCap: input.weeklyCap } : {}) },
    })
    await recordAudit(tx, {
      cycleId: cycle.id, actorId: actor.id, actorRole: 'HR', action: 'CYCLE_EDIT', objectType: 'WeeklyCycle', objectId: cycle.id,
      before: { weekOneStartsOn: cycle.weekOneStartsOn.toISOString(), weeklyCap: cycle.weeklyCap }, after: input,
    })
    return updated
  })
}

const NOT_REMOVABLE = 'Only a cycle that has not started can be removed'

/** A cycle can be removed until it starts. */
export async function deleteCycle(actor: WeeklyActor, cycleId: string): Promise<void> {
  assertHr(actor)
  const cycle = await loadCycle(cycleId)
  if (cycle.status !== 'SETUP') throw new WeeklyError(NOT_REMOVABLE, 409)
  await prisma.$transaction(async (tx) => {
    await tx.weeklyParticipantOverride.deleteMany({ where: { cycleId: cycle.id } })
    // Guarded on status so a concurrent start wins cleanly.
    const removed = await tx.weeklyCycle.deleteMany({ where: { id: cycle.id, status: 'SETUP' } })
    if (removed.count === 0) throw new WeeklyError(NOT_REMOVABLE, 409)
    await recordAudit(tx, {
      cycleId: cycle.id, actorId: actor.id, actorRole: 'HR', action: 'CYCLE_DELETE', objectType: 'WeeklyCycle', objectId: cycle.id,
      before: { periodId: cycle.periodId, weekOneStartsOn: cycle.weekOneStartsOn.toISOString(), weeklyCap: cycle.weeklyCap },
    })
  })
}

export async function participantsView(actor: WeeklyActor, cycleId: string, now: Date): Promise<ParticipantsResponse> {
  assertHr(actor)
  const cycle = await loadCycle(cycleId)
  const assignments = (await getResolvedEvaluationAssignments(cycle.periodId)).filter((a) => isWeeklyRelationshipType(a.relationshipType))
  const [people, overrides] = await Promise.all([
    loadPeople(assignments.map((a) => a.evaluateeId)),
    prisma.weeklyParticipantOverride.findMany({ where: { cycleId, optIn: true } }),
  ])
  const optIns = new Map(overrides.map((o) => [o.userId, o]))
  const total = totalWeeks(cycle.weekOneStartsOn, cycle.period.endDate)
  const rows = [...people.values()].filter((person) => !isOutsideRedesign(person)).map((person) => {
    const optIn = optIns.get(person.id)
    return {
      person: personRef(people, person.id),
      department: person.department,
      exclusion: evaluateeExclusion(person, { now, weekOneStartsOn: cycle.weekOneStartsOn, totalWeeks: total, optedIn: Boolean(optIn) }),
      optedIn: Boolean(optIn),
      optInReason: optIn?.reason ?? null,
    }
  })
  return { cycleId, rows: rows.sort((a, b) => byName(a.person, b.person)) }
}

export async function setOptIn(actor: WeeklyActor, input: { cycleId: string; userId: string; reason: string }): Promise<void> {
  assertHr(actor)
  await loadCycle(input.cycleId)
  await prisma.$transaction(async (tx) => {
    await tx.weeklyParticipantOverride.upsert({
      where: { cycleId_userId: { cycleId: input.cycleId, userId: input.userId } },
      create: { cycleId: input.cycleId, userId: input.userId, optIn: true, reason: input.reason, createdById: actor.id },
      update: { optIn: true, reason: input.reason, createdById: actor.id },
    })
    await recordAudit(tx, { cycleId: input.cycleId, actorId: actor.id, actorRole: 'HR', action: 'OPT_IN', objectType: 'User', objectId: input.userId, reason: input.reason })
  })
}

export async function removeOptIn(actor: WeeklyActor, input: { cycleId: string; userId: string }): Promise<void> {
  assertHr(actor)
  await prisma.$transaction(async (tx) => {
    await tx.weeklyParticipantOverride.deleteMany({ where: { cycleId: input.cycleId, userId: input.userId } })
    await recordAudit(tx, { cycleId: input.cycleId, actorId: actor.id, actorRole: 'HR', action: 'OPT_IN_REMOVE', objectType: 'User', objectId: input.userId })
  })
}

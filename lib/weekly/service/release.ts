import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { cycleWeeks, effectiveWeek, isCatchUpWeek } from '../calendar'
import { evaluateeExclusion, evaluatorExclusion } from '../eligibility'
import { optionsProblem, parseOptions, personalise, shuffleOptions } from '../mcq'
import { bankForPerspective, isWeeklyRelationshipType, perspectiveOf, type Perspective, type WeeklyRelationshipType } from '../perspectives'
import { nextVariant, pickTopic, planWeek, type PairWindow, type SchedulableTopic } from '../scheduler'
import { loadReadyCompetencies, type ReadyCompetency } from './content'
import { toJson } from './db'
import { loadPeople } from './context'
import { loadCycle, roundOpensAt, type CycleWithPeriod } from './cycles'
import { isUniqueViolation } from './db'
import { WeeklyError } from './errors'
import { defaultWindow, pairWindowKey, pairWindows } from './pair-windows'

export interface LivePair { evaluatorId: string; evaluateeId: string; relationshipType: WeeklyRelationshipType; perspective: Perspective }
export interface ReleaseSummary { week: number; slotsCreated: number; slotsCancelled: number; evaluatorsReleased: number; promptsCreated: number; commentPrompts: number }

type SlotKeyed = { evaluatorId: string; evaluateeId: string; relationshipType: string; competencyId: string }
const pairKey = (p: { evaluatorId: string; evaluateeId: string; relationshipType: string }) => `${p.evaluatorId}|${p.evaluateeId}|${p.relationshipType}`
const slotKey = (s: SlotKeyed) => `${pairKey(s)}|${s.competencyId}`
const sameDepartment = (a: string, b: string | null) => a.trim().toLowerCase() === (b ?? '').trim().toLowerCase()
/** A department topic is asked only about people in one of its departments. */
const appliesTo = (topic: ReadyCompetency, department: string | null) => topic.departments.length === 0 || topic.departments.some((d) => sameDepartment(d, department))

/**
 * Brings slots in line with this week's assignments, eligibility and ready topics. Accepted evidence is never removed.
 * A pair that first appears after the quarter's first release gets its own window, from this week to the last question week.
 */
export async function syncSlots(cycle: CycleWithPeriod, now: Date, week: number = Math.max(1, effectiveWeek(cycle.weekOneStartsOn, cycle.simulatedWeek, now))): Promise<{ created: number; cancelled: number; pairs: LivePair[] }> {
  const ready = await loadReadyCompetencies(cycle.id)
  const assignments = (await getResolvedEvaluationAssignments(cycle.periodId)).filter((a) => isWeeklyRelationshipType(a.relationshipType))
  const people = await loadPeople(assignments.flatMap((a) => [a.evaluatorId, a.evaluateeId]))
  const optIns = new Set((await prisma.weeklyParticipantOverride.findMany({ where: { cycleId: cycle.id, optIn: true } })).map((o) => o.userId))
  const opensAt = roundOpensAt(cycle)
  const pairs: LivePair[] = []
  const desired: SlotKeyed[] = []
  for (const a of assignments) {
    const evaluator = people.get(a.evaluatorId)
    const evaluatee = people.get(a.evaluateeId)
    const perspective = perspectiveOf(a.relationshipType)
    if (!evaluator || !evaluatee || !perspective || a.evaluatorId === a.evaluateeId) continue
    if (evaluatorExclusion(evaluator, now, { opensAt, optedIn: optIns.has(evaluator.id) })) continue
    if (evaluateeExclusion(evaluatee, { now, opensAt, optedIn: optIns.has(evaluatee.id) })) continue
    const relationshipType = a.relationshipType as WeeklyRelationshipType
    pairs.push({ evaluatorId: a.evaluatorId, evaluateeId: a.evaluateeId, relationshipType, perspective })
    const topics = (ready.global.get(perspective) ?? []).filter((topic) => appliesTo(topic, evaluatee.department))
    for (const topic of topics) desired.push({ evaluatorId: a.evaluatorId, evaluateeId: a.evaluateeId, relationshipType, competencyId: topic.id })
  }
  const existing = await prisma.weeklySlot.findMany({ where: { cycleId: cycle.id }, select: { id: true, evaluatorId: true, evaluateeId: true, relationshipType: true, competencyId: true, status: true } })
  const existingKeys = new Set(existing.map(slotKey))
  const desiredKeys = new Set(desired.map(slotKey))
  const toCreate = desired.filter((d) => !existingKeys.has(slotKey(d)))
  const knownPairs = new Set(existing.map(pairKey))
  const newPairs = [...new Map(toCreate.filter((d) => !knownPairs.has(pairKey(d))).map((d) => [pairKey(d), d])).values()]
  if (newPairs.length && (await prisma.weeklyRelease.count({ where: { cycleId: cycle.id, weekIndex: { lt: week } } })) > 0) {
    const window = defaultWindow(cycle, week)
    await prisma.weeklyPairWindow.createMany({
      data: newPairs.map((d) => ({ cycleId: cycle.id, evaluatorId: d.evaluatorId, evaluateeId: d.evaluateeId, relationshipType: d.relationshipType as WeeklyRelationshipType, ...window })),
      skipDuplicates: true,
    })
  }
  if (toCreate.length) {
    await prisma.weeklySlot.createMany({ data: toCreate.map((d) => ({ ...d, relationshipType: d.relationshipType as WeeklyRelationshipType, cycleId: cycle.id })), skipDuplicates: true })
  }
  const cancelIds = existing.filter((s) => s.status === 'OPEN' && !desiredKeys.has(slotKey(s))).map((s) => s.id)
  const reopenIds = existing.filter((s) => s.status === 'CANCELLED' && desiredKeys.has(slotKey(s))).map((s) => s.id)
  if (cancelIds.length) {
    await prisma.weeklySlot.updateMany({ where: { id: { in: cancelIds } }, data: { status: 'CANCELLED' } })
    await prisma.weeklyPrompt.updateMany({ where: { slotId: { in: cancelIds }, status: { in: ['OPEN', 'DRAFT'] } }, data: { status: 'CANCELLED' } })
  }
  if (reopenIds.length) await prisma.weeklySlot.updateMany({ where: { id: { in: reopenIds } }, data: { status: 'OPEN' } })
  const livePairs = new Set(pairs.map(pairKey))
  const staleComments = (await prisma.weeklyPrompt.findMany({ where: { cycleId: cycle.id, kind: 'COMMENT', status: { in: ['OPEN', 'DRAFT'] } }, select: { id: true, evaluatorId: true, evaluateeId: true, relationshipType: true } }))
    .filter((p) => !livePairs.has(pairKey(p)))
    .map((p) => p.id)
  if (staleComments.length) await prisma.weeklyPrompt.updateMany({ where: { id: { in: staleComments } }, data: { status: 'CANCELLED' } })
  return { created: toCreate.length, cancelled: cancelIds.length, pairs }
}

type AskableSlot = { id: string; evaluatorId: string; evaluateeId: string; relationshipType: WeeklyRelationshipType | string }
type Variant = { id: string; text: string; options: Prisma.JsonValue }

/** Only questions whose statements are complete can be asked. */
export const askable = <T extends { options: Prisma.JsonValue }>(prompts: readonly T[]): T[] => prompts.filter((p) => optionsProblem(parseOptions(p.options)) === null)

/** A question as one evaluator gets it: the person's first name in the text, the statements shuffled once and kept with their scores. */
export function standardPromptData(slot: AskableSlot, variant: Variant, week: number, now: Date, evaluateeName: string) {
  return {
    cycleId: '', slotId: slot.id, evaluatorId: slot.evaluatorId, evaluateeId: slot.evaluateeId, relationshipType: slot.relationshipType as WeeklyRelationshipType,
    weekIndex: week, kind: 'STANDARD' as const, promptVariantId: variant.id, textSnapshot: personalise(variant.text, evaluateeName),
    options: toJson(shuffleOptions(parseOptions(variant.options), `${slot.id}|${week}`)), releasedAt: now,
  }
}

async function releaseForEvaluator(cycleId: string, week: number, evaluatorId: string, slotIds: string[], askedVariants: Map<string, string[]>, now: Date): Promise<number | null> {
  const slots = slotIds.length
    ? await prisma.weeklySlot.findMany({ where: { id: { in: slotIds } }, include: { competency: { include: { prompts: { where: { isActive: true }, orderBy: { variant: 'asc' } } } } } })
    : []
  const byId = new Map(slots.map((s) => [s.id, s]))
  const names = await loadPeople(slots.map((s) => s.evaluateeId))
  try {
    return await prisma.$transaction(async (tx) => {
      // Claiming the (cycle, week, evaluator) row first makes a concurrent second release fail as a whole.
      await tx.weeklyRelease.create({ data: { cycleId, weekIndex: week, evaluatorId, promptCount: slotIds.length } })
      let created = 0
      for (const slotId of slotIds) {
        const slot = byId.get(slotId)
        const variant = slot ? nextVariant(askable(slot.competency.prompts), askedVariants.get(slotId) ?? []) : null
        if (!slot || !variant) continue
        await tx.weeklyPrompt.create({ data: { ...standardPromptData(slot, variant, week, now, names.get(slot.evaluateeId)?.name ?? 'them'), cycleId } })
        await tx.weeklySlot.update({ where: { id: slotId }, data: { lastAskedWeek: week } })
        created += 1
      }
      return created
    })
  } catch (error) {
    if (isUniqueViolation(error)) return null
    throw error
  }
}

async function releaseComments(cycleId: string, week: number, pairs: LivePair[], now: Date): Promise<number> {
  const textQuestions = await prisma.evaluationQuestion.findMany({
    where: { relationshipType: { in: ['DIRECT_REPORT', 'TEAM_LEAD', 'PEER'] }, questionType: 'TEXT' },
    orderBy: { orderIndex: 'asc' },
  })
  const data = pairs.flatMap((pair) =>
    textQuestions
      .filter((q) => q.relationshipType === bankForPerspective(pair.perspective))
      .map((q) => ({
        cycleId, evaluatorId: pair.evaluatorId, evaluateeId: pair.evaluateeId, relationshipType: pair.relationshipType,
        weekIndex: week, kind: 'COMMENT' as const, questionId: q.id, textSnapshot: q.questionText, releasedAt: now,
      })),
  )
  if (data.length === 0) return 0
  return (await prisma.weeklyPrompt.createMany({ data, skipDuplicates: true })).count
}

type PlannedSlot = { id: string; evaluatorId: string; evaluateeId: string; relationshipType: string; status: string; snoozedUntilWeek: number | null }
type AskedPrompt = { slotId: string | null; evaluatorId: string; evaluateeId: string; relationshipType: string; status: string; weekIndex: number }

/** The topics this evaluator is asked about this week, one per chosen person (see the scheduler). */
export function planEvaluatorWeek(input: {
  cycleId: string; evaluatorId: string; week: number; totalWeeks: number; slots: readonly PlannedSlot[]; prompts: readonly AskedPrompt[]
  windows?: ReadonlyMap<string, PairWindow>
}): string[] {
  const seed = `${input.cycleId}|${input.evaluatorId}`
  const asked = input.prompts.filter((p) => p.evaluatorId === input.evaluatorId)
  const askedOnSlot = new Map<string, number>()
  for (const p of asked) if (p.slotId) askedOnSlot.set(p.slotId, (askedOnSlot.get(p.slotId) ?? 0) + 1)
  const slotsByPair = new Map<string, PlannedSlot[]>()
  for (const slot of input.slots) if (slot.evaluatorId === input.evaluatorId) slotsByPair.set(pairKey(slot), [...(slotsByPair.get(pairKey(slot)) ?? []), slot])
  const topicsOf = (key: string): SchedulableTopic[] =>
    (slotsByPair.get(key) ?? []).map((slot) => ({ id: slot.id, status: slot.status as SchedulableTopic['status'], asked: askedOnSlot.get(slot.id) ?? 0, snoozedUntilWeek: slot.snoozedUntilWeek }))
  const pairs = [...slotsByPair.keys()].map((key) => {
    const mine = asked.filter((p) => pairKey(p) === key)
    return {
      key,
      asked: mine.length,
      lastAskedWeek: mine.length ? Math.max(...mine.map((p) => p.weekIndex)) : null,
      hasOpenPrompt: mine.some((p) => p.status === 'OPEN' || p.status === 'DRAFT'),
      hasAskableTopic: pickTopic(topicsOf(key), input.week, seed) !== null,
      window: input.windows?.get(key),
    }
  })
  return planWeek({ week: input.week, totalWeeks: input.totalWeeks, seed, pairs }).flatMap((key) => pickTopic(topicsOf(key), input.week, seed) ?? [])
}

export async function releaseWeek(cycleId: string, week: number, now: Date, options: { evaluatorId?: string } = {}): Promise<ReleaseSummary> {
  const cycle = await loadCycle(cycleId)
  if (cycle.status !== 'RUNNING') throw new WeeklyError('Start the cycle before releasing questions', 409)
  const total = cycleWeeks(cycle)
  if (week < 1 || week > total) throw new WeeklyError(`Week ${week} is outside this cycle (weeks 1 to ${total})`, 409)
  const sync = await syncSlots(cycle, now, week)
  const windows = await pairWindows(cycleId)
  const livePairs = new Set(sync.pairs.map(pairKey))
  const only = options.evaluatorId ? { evaluatorId: options.evaluatorId } : {}
  const slots = (
    await prisma.weeklySlot.findMany({ where: { cycleId, ...only, status: { not: 'CANCELLED' } }, select: { id: true, evaluatorId: true, evaluateeId: true, relationshipType: true, status: true, snoozedUntilWeek: true } })
  ).filter((s) => livePairs.has(pairKey(s)))
  const prompts = await prisma.weeklyPrompt.findMany({
    where: { cycleId, ...only, kind: 'STANDARD', status: { not: 'CANCELLED' } },
    select: { slotId: true, evaluatorId: true, evaluateeId: true, relationshipType: true, status: true, weekIndex: true, promptVariantId: true },
  })
  const askedVariants = new Map<string, string[]>()
  for (const p of prompts) if (p.slotId && p.promptVariantId) askedVariants.set(p.slotId, [...(askedVariants.get(p.slotId) ?? []), p.promptVariantId])
  let evaluatorsReleased = 0
  let promptsCreated = 0
  for (const evaluatorId of new Set(slots.map((s) => s.evaluatorId))) {
    const chosen = planEvaluatorWeek({ cycleId, evaluatorId, week, totalWeeks: total, slots, prompts, windows })
    const count = await releaseForEvaluator(cycleId, week, evaluatorId, chosen, askedVariants, now)
    if (count === null) continue
    evaluatorsReleased += 1
    promptsCreated += count
  }
  const commentPairs = sync.pairs.filter((p) => !options.evaluatorId || p.evaluatorId === options.evaluatorId)
  const commentPrompts = isCatchUpWeek(week, total) ? await releaseComments(cycleId, week, commentPairs, now) : 0
  return { week, slotsCreated: sync.created, slotsCancelled: sync.cancelled, evaluatorsReleased, promptsCreated, commentPrompts }
}

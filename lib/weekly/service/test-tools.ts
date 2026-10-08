import { prisma } from '@/lib/db'
import { cycleWeeks, effectiveWeek } from '../calendar'
import { areWeeklyTestToolsEnabled } from '../flag'
import { recordAudit } from './audit'
import { assertHr, type WeeklyActor } from './context'
import { loadCycle } from './cycles'
import { WeeklyError } from './errors'
import { submitAnswer } from './inbox'
import { stableHash } from '../hash'
import { parseOptions } from '../mcq'
import { loadPeople } from './context'
import { askable, releaseWeek, standardPromptData, syncSlots, type ReleaseSummary } from './release'
import { resolveActiveModel } from './ai-settings'
import { runScoring, type ScoringRunSummary } from './scoring'
import { PERSPECTIVE_LABELS } from '../perspectives'
import { nextVariant, pickTopic } from '../scheduler'

/** Preview-only: refuses unless WEEKLY_TEST_TOOLS is on, and only for HR. */
export function assertTestTools(actor: WeeklyActor): void {
  if (!areWeeklyTestToolsEnabled()) throw new WeeklyError('Test tools are off', 404)
  assertHr(actor)
}

export async function releaseNextWeek(actor: WeeklyActor, cycleId: string, now: Date): Promise<ReleaseSummary> {
  assertTestTools(actor)
  const cycle = await loadCycle(cycleId)
  const total = cycleWeeks(cycle)
  const last = (await prisma.weeklyRelease.aggregate({ where: { cycleId }, _max: { weekIndex: true } }))._max.weekIndex ?? 0
  const week = last === 0 ? Math.min(total, Math.max(1, effectiveWeek(cycle.weekOneStartsOn, cycle.simulatedWeek, now))) : last + 1
  if (week > total) throw new WeeklyError('Every week of this cycle has been released', 409)
  await prisma.weeklyCycle.update({ where: { id: cycleId }, data: { simulatedWeek: week } })
  const summary = await releaseWeek(cycleId, week, now)
  await recordAudit(prisma, { cycleId, actorId: actor.id, actorRole: 'HR', action: 'TEST_RELEASE_WEEK', objectType: 'WeeklyCycle', objectId: cycleId, after: summary })
  return summary
}

export async function fillSynthetic(actor: WeeklyActor, cycleId: string, evaluatorId: string | undefined, now: Date): Promise<{ answered: number }> {
  assertTestTools(actor)
  const prompts = await prisma.weeklyPrompt.findMany({
    where: { cycleId, status: { in: ['OPEN', 'DRAFT'] }, ...(evaluatorId ? { evaluatorId } : {}) },
    include: { slot: { select: { competency: { select: { name: true } } } } },
    orderBy: { createdAt: 'asc' },
  })
  for (const prompt of prompts) {
    // A middling statement (2 to 3.5), so no note is needed and the cap on 4s is never touched.
    const middling = parseOptions(prompt.options).filter((o) => o.score >= 2 && o.score <= 3.5)
    const choice = middling[stableHash(prompt.id) % Math.max(1, middling.length)]
    const input = prompt.kind === 'COMMENT' ? { commentText: 'A test comment from the preview tools.' } : { optionId: choice?.id ?? null }
    await submitAnswer(actor, { evaluatorId: prompt.evaluatorId, actingAs: true }, prompt.id, input, now)
  }
  await recordAudit(prisma, { cycleId, actorId: actor.id, actorRole: 'HR', action: 'TEST_FILL', objectType: 'WeeklyCycle', objectId: cycleId, after: { evaluatorId: evaluatorId ?? null, answered: prompts.length } })
  return { answered: prompts.length }
}

export async function resetCycle(actor: WeeklyActor, cycleId: string): Promise<void> {
  assertTestTools(actor)
  await loadCycle(cycleId)
  const promptIds = (await prisma.weeklyPrompt.findMany({ where: { cycleId }, select: { id: true } })).map((p) => p.id)
  const responseIds = (await prisma.weeklyResponse.findMany({ where: { promptId: { in: promptIds } }, select: { id: true } })).map((r) => r.id)
  await prisma.$transaction([
    prisma.weeklyResponse.deleteMany({ where: { id: { in: responseIds } } }),
    prisma.weeklyPrompt.deleteMany({ where: { cycleId } }),
    prisma.weeklyRelease.deleteMany({ where: { cycleId } }),
    prisma.weeklyPairWindow.deleteMany({ where: { cycleId } }),
    prisma.weeklySlot.deleteMany({ where: { cycleId } }),
    prisma.weeklyCycle.update({ where: { id: cycleId }, data: { simulatedWeek: null } }),
  ])
  await recordAudit(prisma, { cycleId, actorId: actor.id, actorRole: 'HR', action: 'TEST_RESET', objectType: 'WeeklyCycle', objectId: cycleId })
}

/** Previews have no cron: scores this cycle's waiting answers now with the active model (the stand-in when forced). */
export async function scoreNow(actor: WeeklyActor, cycleId: string, now: Date): Promise<ScoringRunSummary> {
  assertTestTools(actor)
  await loadCycle(cycleId)
  const responses = await prisma.weeklyResponse.findMany({ where: { prompt: { cycleId, kind: 'STANDARD' } }, select: { id: true } })
  const summary = await runScoring({ model: await resolveActiveModel(), budgetMs: 50_000, responseIds: responses.map((r) => r.id), clock: () => now })
  await recordAudit(prisma, { cycleId, actorId: actor.id, actorRole: 'HR', action: 'TEST_SCORE_NOW', objectType: 'WeeklyCycle', objectId: cycleId, after: summary })
  return summary
}

function currentWeek(cycle: Awaited<ReturnType<typeof loadCycle>>, now: Date): number {
  return Math.min(cycleWeeks(cycle), Math.max(1, effectiveWeek(cycle.weekOneStartsOn, cycle.simulatedWeek, now)))
}

/** For live demos: releases this week's questions for one evaluator only, as the daily release would. */
export async function releaseWeekFor(actor: WeeklyActor, cycleId: string, evaluatorId: string, now: Date): Promise<ReleaseSummary> {
  assertTestTools(actor)
  const week = currentWeek(await loadCycle(cycleId), now)
  const summary = await releaseWeek(cycleId, week, now, { evaluatorId })
  await recordAudit(prisma, { cycleId, actorId: actor.id, actorRole: 'HR', action: 'TEST_RELEASE_FOR', objectType: 'User', objectId: evaluatorId, after: summary })
  return summary
}

/**
 * For live demos: the evaluator's next question about one person, now (both must be mapped), outside the weekly
 * schedule. One open question per person at a time, as in the schedule.
 */
export async function askPairNow(actor: WeeklyActor, cycleId: string, pair: { evaluatorId: string; evaluateeId: string }, now: Date): Promise<{ prompts: number }> {
  assertTestTools(actor)
  const cycle = await loadCycle(cycleId)
  if (cycle.status !== 'RUNNING') throw new WeeklyError('Start the cycle before asking questions', 409)
  const mapped = new Set((await syncSlots(cycle, now)).pairs.filter((p) => p.evaluatorId === pair.evaluatorId && p.evaluateeId === pair.evaluateeId).map((p) => p.relationshipType as string))
  if (mapped.size === 0) throw new WeeklyError('These two are not paired for weekly questions in this quarter', 409)
  const week = currentWeek(cycle, now)
  const [slots, asked] = await Promise.all([
    prisma.weeklySlot.findMany({
      where: { cycleId, ...pair, status: { not: 'CANCELLED' } },
      include: { competency: { include: { prompts: { where: { isActive: true }, orderBy: { variant: 'asc' } } } } },
    }),
    prisma.weeklyPrompt.findMany({ where: { cycleId, ...pair, kind: 'STANDARD', status: { not: 'CANCELLED' } }, select: { slotId: true, status: true, promptVariantId: true } }),
  ])
  if (asked.some((p) => p.status === 'OPEN' || p.status === 'DRAFT')) throw new WeeklyError('They already have an open question about this person. Answer it first.', 409)
  const live = slots.filter((s) => mapped.has(s.relationshipType))
  const topicId = pickTopic(
    live.map((s) => ({ id: s.id, status: s.status, asked: asked.filter((p) => p.slotId === s.id).length, snoozedUntilWeek: s.snoozedUntilWeek })),
    week, `${cycleId}|${pair.evaluatorId}`,
  )
  const slot = live.find((s) => s.id === topicId)
  const variant = slot ? nextVariant(askable(slot.competency.prompts), asked.flatMap((p) => (p.slotId === slot.id && p.promptVariantId ? [p.promptVariantId] : []))) : null
  if (!slot || !variant) throw new WeeklyError('No topic about this person can be asked now', 409)
  const name = (await loadPeople([slot.evaluateeId])).get(slot.evaluateeId)?.name ?? 'them'
  await prisma.$transaction([
    prisma.weeklyPrompt.create({ data: { ...standardPromptData(slot, variant, week, now, name), cycleId } }),
    prisma.weeklySlot.update({ where: { id: slot.id }, data: { lastAskedWeek: week } }),
  ])
  await recordAudit(prisma, { cycleId, actorId: actor.id, actorRole: 'HR', action: 'TEST_ASK_PAIR', objectType: 'User', objectId: pair.evaluateeId, after: { ...pair, slotId: slot.id } })
  return { prompts: 1 }
}

export interface PairOption { evaluatee: { id: string; name: string }; perspective: string }

/** Who an evaluator really evaluates this quarter, for the pair picker. Syncs the quarter's topics first, as asking does. */
export async function pairsFor(actor: WeeklyActor, cycleId: string, evaluatorId: string, now: Date): Promise<PairOption[]> {
  assertTestTools(actor)
  const cycle = await loadCycle(cycleId)
  const mine = (await syncSlots(cycle, now)).pairs.filter((p) => p.evaluatorId === evaluatorId)
  const people = await prisma.user.findMany({ where: { id: { in: mine.map((p) => p.evaluateeId) } }, select: { id: true, name: true } })
  const names = new Map(people.map((u) => [u.id, u.name]))
  return mine
    .map((p) => ({ evaluatee: { id: p.evaluateeId, name: names.get(p.evaluateeId) ?? 'Unknown person' }, perspective: PERSPECTIVE_LABELS[p.perspective] }))
    .sort((a, b) => a.evaluatee.name.localeCompare(b.evaluatee.name))
}

import { prisma } from '@/lib/db'
import type { ModelChoice } from '../ai/configured'
import { fakeModel } from '../ai/model'
import { cycleWeeks, effectiveWeek } from '../calendar'
import { syntheticAnswer, syntheticComment } from '../content/synthetic'
import { areWeeklyTestToolsEnabled } from '../flag'
import { loadAnswerRecords } from './answer-states'
import { resolveActiveModel } from './ai-settings'
import { recordAudit } from './audit'
import { approveProfile } from './content'
import { assertHr, type WeeklyActor } from './context'
import { loadCycle } from './cycles'
import { autoAcceptDue, decideAnswer } from './decisions'
import { WeeklyError } from './errors'
import { submitAnswer } from './inbox'
import { releaseWeek, syncSlots, type ReleaseSummary } from './release'
import { PERSPECTIVE_LABELS } from '../perspectives'
import { nextVariant, pickTopic } from '../scheduler'
import { runScoring, type ScoringRunSummary } from './scoring'

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
    const input =
      prompt.kind === 'COMMENT'
        ? { situation: '', action: '', result: '', commentText: syntheticComment(prompt.id) }
        : (({ situation, action, result, shortfall }) => ({ situation, action, result, shortfall: shortfall || null }))(syntheticAnswer(prompt.id, prompt.slot?.competency.name ?? 'the work'))
    await submitAnswer(actor, { evaluatorId: prompt.evaluatorId, actingAs: true }, prompt.id, input, now)
  }
  await recordAudit(prisma, { cycleId, actorId: actor.id, actorRole: 'HR', action: 'TEST_FILL', objectType: 'WeeklyCycle', objectId: cycleId, after: { evaluatorId: evaluatorId ?? null, answered: prompts.length } })
  return { answered: prompts.length }
}

export async function approveAllDrafts(actor: WeeklyActor): Promise<{ approved: number }> {
  assertTestTools(actor)
  const drafts = await prisma.weeklyProfile.findMany({ where: { status: 'DRAFT' }, select: { id: true } })
  for (const draft of drafts) await approveProfile(actor, draft.id)
  return { approved: drafts.length }
}

export async function resetCycle(actor: WeeklyActor, cycleId: string): Promise<void> {
  assertTestTools(actor)
  await loadCycle(cycleId)
  const promptIds = (await prisma.weeklyPrompt.findMany({ where: { cycleId }, select: { id: true } })).map((p) => p.id)
  const responseIds = (await prisma.weeklyResponse.findMany({ where: { promptId: { in: promptIds } }, select: { id: true } })).map((r) => r.id)
  await prisma.$transaction([
    prisma.weeklyScoreReview.deleteMany({ where: { responseId: { in: responseIds } } }),
    prisma.weeklyAiScore.deleteMany({ where: { responseId: { in: responseIds } } }),
    prisma.weeklyScoringJob.deleteMany({ where: { responseId: { in: responseIds } } }),
    prisma.weeklyResponse.deleteMany({ where: { id: { in: responseIds } } }),
    prisma.weeklyPrompt.deleteMany({ where: { cycleId } }),
    prisma.weeklyRelease.deleteMany({ where: { cycleId } }),
    prisma.weeklyPairWindow.deleteMany({ where: { cycleId } }),
    prisma.weeklySlot.deleteMany({ where: { cycleId } }),
    prisma.weeklyCycle.update({ where: { id: cycleId }, data: { simulatedWeek: null } }),
  ])
  await recordAudit(prisma, { cycleId, actorId: actor.id, actorRole: 'HR', action: 'TEST_RESET', objectType: 'WeeklyCycle', objectId: cycleId })
}

export const SCORE_NOW_BUDGET_MS = 50_000

/** Scores this cycle's waiting answers now (cron jobs do not run on previews). Time-boxed; run again for the rest. */
export async function scoreNow(actor: WeeklyActor, cycleId: string, choice: ModelChoice): Promise<ScoringRunSummary> {
  assertTestTools(actor)
  await loadCycle(cycleId)
  const responses = await prisma.weeklyResponse.findMany({ where: { prompt: { cycleId, kind: { not: 'COMMENT' } } }, select: { id: true } })
  const model = choice === 'stand-in' ? fakeModel() : await resolveActiveModel()
  const summary = await runScoring({ model, budgetMs: SCORE_NOW_BUDGET_MS, responseIds: responses.map((r) => r.id) })
  await recordAudit(prisma, { cycleId, actorId: actor.id, actorRole: 'HR', action: 'TEST_SCORE_NOW', objectType: 'WeeklyCycle', objectId: cycleId, after: { ...summary, model: choice } })
  return summary
}

/** Accepts every score that would be accepted after 72 hours, without waiting. */
export async function acceptDueNow(actor: WeeklyActor, cycleId: string, now: Date): Promise<{ accepted: number }> {
  assertTestTools(actor)
  await loadCycle(cycleId)
  const result = await autoAcceptDue(now, { cycleId, ignoreWait: true })
  await recordAudit(prisma, { cycleId, actorId: actor.id, actorRole: 'HR', action: 'TEST_ACCEPT_DUE', objectType: 'WeeklyCycle', objectId: cycleId, after: result })
  return result
}

/** Preview only: finishes scoring with the stand-in model and decides everything that would block the close. */
export async function settleForClose(actor: WeeklyActor, cycleId: string, now: Date): Promise<{ scored: number; accepted: number; scoredByHand: number }> {
  assertTestTools(actor)
  await loadCycle(cycleId)
  const responses = await prisma.weeklyResponse.findMany({ where: { prompt: { cycleId, kind: { not: 'COMMENT' } } }, select: { id: true } })
  // Scored "at" now, so the decisions below (also at now) follow the scores they decide.
  const scoring = await runScoring({ model: fakeModel(), budgetMs: SCORE_NOW_BUDGET_MS, responseIds: responses.map((r) => r.id), clock: () => now })
  let accepted = 0
  let scoredByHand = 0
  for (const record of await loadAnswerRecords({ cycleId })) {
    const basedOn = { aiScoreId: record.aiScore?.id ?? null, reviewId: record.latestReview?.id ?? null }
    const acceptable = record.aiScore?.sufficiency === 'SUFFICIENT' && record.aiScore.score !== null
    if (record.state === 'NEEDS_REVIEW' && acceptable) {
      await decideAnswer(actor, record.responseId, { action: 'ACCEPT', basedOn }, now)
      accepted += 1
    } else if (record.state === 'NEEDS_REVIEW' || record.state === 'FAILED') {
      // Failed scoring, or a thin answer HR must see (Part B sends sensitive thin answers to review): score it by hand.
      await decideAnswer(actor, record.responseId, { action: 'SET_SCORE', score: 2, reason: 'Scored by the preview test tools', basedOn }, now)
      scoredByHand += 1
    }
  }
  await recordAudit(prisma, { cycleId, actorId: actor.id, actorRole: 'HR', action: 'TEST_SETTLE', objectType: 'WeeklyCycle', objectId: cycleId, after: { scored: scoring.scored, accepted, scoredByHand } })
  return { scored: scoring.scored, accepted, scoredByHand }
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
  const variant = slot ? nextVariant(slot.competency.prompts, asked.flatMap((p) => (p.slotId === slot.id && p.promptVariantId ? [p.promptVariantId] : []))) : null
  if (!slot || !variant) throw new WeeklyError('No topic about this person can be asked now', 409)
  await prisma.$transaction([
    prisma.weeklyPrompt.create({
      data: {
        cycleId, slotId: slot.id, evaluatorId: slot.evaluatorId, evaluateeId: slot.evaluateeId, relationshipType: slot.relationshipType,
        weekIndex: week, kind: 'STANDARD', promptVariantId: variant.id, textSnapshot: variant.text, releasedAt: now,
      },
    }),
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

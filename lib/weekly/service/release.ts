import type { WeeklySlotStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { isCatchUpWeek, totalWeeks } from '../calendar'
import { evaluateeExclusion, evaluatorExclusion } from '../eligibility'
import { bankForPerspective, isWeeklyRelationshipType, perspectiveOf, type Perspective, type WeeklyRelationshipType } from '../perspectives'
import { isConfirmedAction, latestByResponse } from '../reviews'
import { nextVariant, planBatch } from '../scheduler'
import { awaitingDecisionSlotIds } from './answer-states'
import { ensureLeadCustomCompetencies, loadReadyCompetencies } from './content'
import { loadPeople } from './context'
import { loadCycle, type CycleWithPeriod } from './cycles'
import { isUniqueViolation } from './db'
import { WeeklyError } from './errors'

export interface LivePair { evaluatorId: string; evaluateeId: string; relationshipType: WeeklyRelationshipType; perspective: Perspective }
export interface ReleaseSummary { week: number; slotsCreated: number; slotsCancelled: number; evaluatorsReleased: number; promptsCreated: number; commentPrompts: number }

type SlotKeyed = { evaluatorId: string; evaluateeId: string; relationshipType: string; competencyId: string }
const pairKey = (p: { evaluatorId: string; evaluateeId: string; relationshipType: string }) => `${p.evaluatorId}|${p.evaluateeId}|${p.relationshipType}`
const slotKey = (s: SlotKeyed) => `${pairKey(s)}|${s.competencyId}`

/** Brings slots in line with this week's assignments, eligibility and ready topics. Accepted evidence is never removed. */
export async function syncSlots(cycle: CycleWithPeriod, now: Date): Promise<{ created: number; cancelled: number; pairs: LivePair[] }> {
  await ensureLeadCustomCompetencies(cycle)
  const ready = await loadReadyCompetencies(cycle.id)
  const assignments = (await getResolvedEvaluationAssignments(cycle.periodId)).filter((a) => isWeeklyRelationshipType(a.relationshipType))
  const people = await loadPeople(assignments.flatMap((a) => [a.evaluatorId, a.evaluateeId]))
  const optIns = new Set((await prisma.weeklyParticipantOverride.findMany({ where: { cycleId: cycle.id, optIn: true } })).map((o) => o.userId))
  const total = totalWeeks(cycle.weekOneStartsOn, cycle.period.endDate)
  const pairs: LivePair[] = []
  const desired: SlotKeyed[] = []
  for (const a of assignments) {
    const evaluator = people.get(a.evaluatorId)
    const evaluatee = people.get(a.evaluateeId)
    const perspective = perspectiveOf(a.relationshipType)
    if (!evaluator || !evaluatee || !perspective || a.evaluatorId === a.evaluateeId) continue
    if (evaluatorExclusion(evaluator, now)) continue
    if (evaluateeExclusion(evaluatee, { now, weekOneStartsOn: cycle.weekOneStartsOn, totalWeeks: total, optedIn: optIns.has(evaluatee.id) })) continue
    const relationshipType = a.relationshipType as WeeklyRelationshipType
    pairs.push({ evaluatorId: a.evaluatorId, evaluateeId: a.evaluateeId, relationshipType, perspective })
    const topics = [...(ready.global.get(perspective) ?? []), ...(perspective === 'LEAD' ? ready.customByLead.get(a.evaluatorId) ?? [] : [])]
    for (const topic of topics) desired.push({ evaluatorId: a.evaluatorId, evaluateeId: a.evaluateeId, relationshipType, competencyId: topic.id })
  }
  const existing = await prisma.weeklySlot.findMany({ where: { cycleId: cycle.id }, select: { id: true, evaluatorId: true, evaluateeId: true, relationshipType: true, competencyId: true, status: true } })
  const existingKeys = new Set(existing.map(slotKey))
  const desiredKeys = new Set(desired.map(slotKey))
  const toCreate = desired.filter((d) => !existingKeys.has(slotKey(d)))
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

type ReviewedPrompt = { slotId: string | null; kind: string; status: string; response: { id: string } | null }

/** Confirmed answers per slot. */
async function reviewStateBySlot(prompts: ReviewedPrompt[]): Promise<{ confirmed: Map<string, number> }> {
  const slotByResponse = new Map(prompts.flatMap((p) => (p.slotId && p.response ? [[p.response.id, p.slotId] as const] : [])))
  const confirmed = new Map<string, number>()
  if (slotByResponse.size === 0) return { confirmed }
  const reviews = await prisma.weeklyScoreReview.findMany({ where: { responseId: { in: [...slotByResponse.keys()] } }, select: { id: true, responseId: true, createdAt: true, action: true } })
  const latest = latestByResponse(reviews)
  for (const review of latest.values()) {
    if (!isConfirmedAction(review.action)) continue
    const slotId = slotByResponse.get(review.responseId)
    if (slotId) confirmed.set(slotId, (confirmed.get(slotId) ?? 0) + 1)
  }
  return { confirmed }
}

async function releaseForEvaluator(cycleId: string, week: number, evaluatorId: string, slotIds: string[], askedVariants: Map<string, string[]>, now: Date): Promise<number | null> {
  const slots = slotIds.length
    ? await prisma.weeklySlot.findMany({ where: { id: { in: slotIds } }, include: { competency: { include: { prompts: { where: { isActive: true }, orderBy: { variant: 'asc' } } } } } })
    : []
  const byId = new Map(slots.map((s) => [s.id, s]))
  try {
    return await prisma.$transaction(async (tx) => {
      // Claiming the (cycle, week, evaluator) row first makes a concurrent second release fail as a whole.
      await tx.weeklyRelease.create({ data: { cycleId, weekIndex: week, evaluatorId, promptCount: slotIds.length } })
      let created = 0
      for (const slotId of slotIds) {
        const slot = byId.get(slotId)
        const variant = slot ? nextVariant(slot.competency.prompts, askedVariants.get(slotId) ?? []) : null
        if (!slot || !variant) continue
        await tx.weeklyPrompt.create({
          data: {
            cycleId, slotId, evaluatorId, evaluateeId: slot.evaluateeId, relationshipType: slot.relationshipType,
            weekIndex: week, kind: 'STANDARD', promptVariantId: variant.id, textSnapshot: variant.text, releasedAt: now,
          },
        })
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

export async function releaseWeek(cycleId: string, week: number, now: Date): Promise<ReleaseSummary> {
  const cycle = await loadCycle(cycleId)
  if (cycle.status !== 'RUNNING') throw new WeeklyError('Start the cycle before releasing questions', 409)
  const total = totalWeeks(cycle.weekOneStartsOn, cycle.period.endDate)
  if (week < 1 || week > total) throw new WeeklyError(`Week ${week} is outside this cycle (weeks 1 to ${total})`, 409)
  const sync = await syncSlots(cycle, now)
  const livePairs = new Set(sync.pairs.map(pairKey))
  const slots = (
    await prisma.weeklySlot.findMany({ where: { cycleId, status: { in: ['OPEN', 'SATISFIED'] } }, include: { competency: { select: { perspective: true } } } })
  ).filter((s) => livePairs.has(pairKey(s)))
  const prompts = await prisma.weeklyPrompt.findMany({
    where: { cycleId },
    select: { slotId: true, evaluatorId: true, status: true, kind: true, promptVariantId: true, response: { select: { id: true } } },
  })
  const open = prompts.filter((p) => (p.status === 'OPEN' || p.status === 'DRAFT') && p.kind !== 'COMMENT')
  const openSlots = new Set(open.flatMap((p) => (p.slotId ? [p.slotId] : [])))
  const { confirmed } = await reviewStateBySlot(prompts)
  // Being scored, failed, or waiting for HR or the 72-hour accept. A thin answer waiting on its follow-up is not.
  const awaiting = await awaitingDecisionSlotIds(cycleId)
  const askedVariants = new Map<string, string[]>()
  for (const p of prompts) if (p.slotId && p.promptVariantId) askedVariants.set(p.slotId, [...(askedVariants.get(p.slotId) ?? []), p.promptVariantId])
  const evidenceByEvaluatee = new Map<string, number>()
  for (const s of slots) evidenceByEvaluatee.set(s.evaluateeId, (evidenceByEvaluatee.get(s.evaluateeId) ?? 0) + (confirmed.get(s.id) ?? 0) + (openSlots.has(s.id) || awaiting.has(s.id) ? 1 : 0))
  const byEvaluator = new Map<string, typeof slots>()
  for (const s of slots) byEvaluator.set(s.evaluatorId, [...(byEvaluator.get(s.evaluatorId) ?? []), s])
  let evaluatorsReleased = 0
  let promptsCreated = 0
  for (const [evaluatorId, evaluatorSlots] of byEvaluator) {
    const chosen = planBatch({
      week, totalWeeks: total, cap: cycle.weeklyCap, evidenceByEvaluatee,
      openPromptCount: open.filter((p) => p.evaluatorId === evaluatorId).length,
      slots: evaluatorSlots.map((s) => ({
        id: s.id, evaluateeId: s.evaluateeId, perspective: s.competency.perspective, status: s.status as WeeklySlotStatus,
        confirmedSamples: confirmed.get(s.id) ?? 0, hasOpenPrompt: openSlots.has(s.id), awaitingDecision: awaiting.has(s.id), lastAskedWeek: s.lastAskedWeek, snoozedUntilWeek: s.snoozedUntilWeek,
      })),
    })
    const count = await releaseForEvaluator(cycleId, week, evaluatorId, chosen, askedVariants, now)
    if (count === null) continue
    evaluatorsReleased += 1
    promptsCreated += count
  }
  const commentPrompts = isCatchUpWeek(week, total) ? await releaseComments(cycleId, week, sync.pairs, now) : 0
  return { week, slotsCreated: sync.created, slotsCancelled: sync.cancelled, evaluatorsReleased, promptsCreated, commentPrompts }
}

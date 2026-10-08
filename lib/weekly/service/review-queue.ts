// HR reviews every score (HR's decision): the model proposes, HR accepts it or sets the score with a reason. The 10% cap
// on 4s applies here: confirming a 4 past an evaluator's limit needs a reason.
import { prisma } from '@/lib/db'
import { isFourRatingCapExempt } from '@/lib/evaluation-rating-quota'
import { fourRatingLimit, MCQ_LEVELS, parseOptions } from '../mcq'
import type { Perspective } from '../perspectives'
import { ANSWER_STATES, type AnswerState } from '../review-rules'
import { QUESTIONS_PER_PAIR } from '../scheduler'
import type { ReviewItem, ReviewQueueResponse } from '../view-types'
import { loadAnswerRecords, type AnswerRecord } from './answer-states'
import { recordAudit } from './audit'
import { assertHr, loadPeople, personRef, type WeeklyActor } from './context'
import { WeeklyError } from './errors'

const TOP = 4
const PEER_TYPES = ['PEER', 'CROSS_DEPARTMENT']
const typesFor = (perspective: Perspective, type: string) => (perspective === 'PEER' ? PEER_TYPES : [type])

export interface FourUse { used: number; limit: number; exempt: boolean }

/** How many confirmed 4s this evaluator has given in this relationship this quarter (other answers), and the limit. */
async function fourUse(records: readonly AnswerRecord[], record: AnswerRecord, exempt: boolean): Promise<FourUse> {
  const types = typesFor(record.perspective, record.relationshipType)
  const pairs = await prisma.weeklySlot.findMany({
    where: { cycleId: record.cycleId, evaluatorId: record.evaluatorId, relationshipType: { in: types as never }, status: { not: 'CANCELLED' } },
    distinct: ['evaluateeId'], select: { evaluateeId: true },
  })
  const live = new Set(pairs.map((p) => p.evaluateeId))
  const used = records.filter((r) => r.responseId !== record.responseId && r.evaluatorId === record.evaluatorId && types.includes(r.relationshipType) && live.has(r.evaluateeId) && r.score === TOP).length
  return { used, limit: fourRatingLimit(pairs.length * QUESTIONS_PER_PAIR), exempt }
}

export async function reviewQueue(actor: WeeklyActor, cycleId: string, filter: AnswerState): Promise<ReviewQueueResponse> {
  assertHr(actor)
  const records = await loadAnswerRecords({ cycleId })
  const counts = Object.fromEntries(ANSWER_STATES.map((s) => [s, records.filter((r) => r.state === s).length])) as Record<AnswerState, number>
  const shown = records.filter((r) => r.state === filter)
  const prompts = new Map((await prisma.weeklyPrompt.findMany({ where: { id: { in: shown.map((r) => r.promptId) } }, include: { response: true } })).map((p) => [p.id, p]))
  const people = await loadPeople(shown.flatMap((r) => [r.evaluatorId, r.evaluateeId, r.review?.reviewerId ?? '']))
  const items: ReviewItem[] = []
  for (const r of shown) {
    const prompt = prompts.get(r.promptId)
    const options = parseOptions(prompt?.options)
    const chosen = options.find((o) => o.id === prompt?.response?.optionId)
    const evaluator = people.get(r.evaluatorId)
    items.push({
      responseId: r.responseId, revision: r.revision, weekIndex: r.weekIndex, topic: r.topic, perspective: r.perspective, state: r.state,
      evaluator: personRef(people, r.evaluatorId), evaluatee: personRef(people, r.evaluateeId), question: prompt?.textSnapshot ?? '',
      statements: [...options].sort((a, b) => a.score - b.score).map((o) => ({ id: o.id, text: o.text, level: o.score })),
      chosen: { id: chosen?.id ?? '', text: chosen?.text ?? '', level: r.level },
      note: prompt?.response?.note ?? null,
      ai: r.aiScore && { id: r.aiScore.id, score: r.aiScore.score, rationale: r.aiScore.rationale, model: r.aiScore.model },
      decision: r.review && { action: r.review.action, finalScore: r.review.finalScore, reason: r.review.reason, reviewer: personRef(people, r.review.reviewerId).name, at: r.review.createdAt.toISOString() },
      jobError: r.job?.status === 'FAILED' ? r.job.error : null,
      fours: await fourUse(records, r, evaluator ? isFourRatingCapExempt(evaluator) : false),
    })
  }
  return { cycleId, counts, items }
}

export type DecisionInput = { action: 'ACCEPT' | 'SET_SCORE'; score?: number; reason?: string | null; revision: number; aiScoreId?: string }

const CHANGED = 'The evaluator changed this answer since you opened it. Reload to see the new one.'

export async function decideAnswer(actor: WeeklyActor, responseId: string, input: DecisionInput, now: Date): Promise<{ finalScore: number }> {
  assertHr(actor)
  const reason = input.reason?.trim() || null
  if (input.action === 'SET_SCORE') {
    if (input.score === undefined || !(MCQ_LEVELS as readonly number[]).includes(input.score)) throw new WeeklyError('Scores go from 1 to 4 in half points')
    if (!reason) throw new WeeklyError('Give a reason for setting the score')
  }
  const finalScore = await prisma.$transaction(async (tx) => {
    // The answer row is locked, so an edit cannot slip in between the check and the decision.
    await tx.$queryRaw`SELECT id FROM "WeeklyResponse" WHERE id = ${responseId} FOR UPDATE`
    const response = await tx.weeklyResponse.findUnique({ where: { id: responseId }, include: { prompt: { include: { cycle: { select: { periodId: true } } } } } })
    if (!response || response.prompt.kind !== 'STANDARD') throw new WeeklyError('Answer not found', 404)
    if (response.revision !== input.revision) throw new WeeklyError(CHANGED, 409)
    const period = await tx.evaluationPeriod.findUnique({ where: { id: response.prompt.cycle.periodId }, select: { isLocked: true } })
    if (period?.isLocked) throw new WeeklyError('This quarter is locked', 409)
    // One evaluator's decisions one at a time, so two 4s at once cannot both pass the cap.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`weekly-review:${response.prompt.cycleId}:${response.prompt.evaluatorId}`}))::text`
    const records = await loadAnswerRecords({ cycleId: response.prompt.cycleId, evaluatorId: response.prompt.evaluatorId }, tx)
    const record = records.find((r) => r.responseId === responseId)
    if (!record) throw new WeeklyError('Answer not found', 404)
    let score: number
    if (input.action === 'ACCEPT') {
      if (!record.aiScore) throw new WeeklyError('There is no score from the model to accept yet. Set the score yourself.', 409)
      // Bound to the score HR saw: a newer one for the same answer means HR looks again.
      if (input.aiScoreId && input.aiScoreId !== record.aiScore.id) throw new WeeklyError('The model\'s score changed since you opened this answer. Reload to see it.', 409)
      score = record.aiScore.score
    } else {
      score = input.score as number
    }
    if (score === TOP) {
      const evaluator = (await loadPeople([record.evaluatorId])).get(record.evaluatorId)
      const use = await fourUse(records, record, evaluator ? isFourRatingCapExempt(evaluator) : false)
      if (!use.exempt && use.used >= use.limit && !reason) {
        throw new WeeklyError(`${evaluator?.name ?? 'This evaluator'} already has ${use.used} confirmed 4${use.used === 1 ? '' : 's'} in this relationship; the limit is ${use.limit}. Give a reason to confirm another.`, 409)
      }
    }
    await tx.weeklyScoreReview.create({
      data: { responseId, revision: input.revision, aiScoreId: record.aiScore?.id ?? null, action: input.action === 'ACCEPT' ? 'ACCEPTED' : 'ADJUSTED', finalScore: score, reason, reviewerId: actor.id, createdAt: now },
    })
    await recordAudit(tx, { actorId: actor.id, actorRole: 'HR', action: `ANSWER_${input.action}`, objectType: 'WeeklyResponse', objectId: responseId, after: { finalScore: score, revision: input.revision } })
    return score
  })
  return { finalScore }
}

/** Sends a failed answer back to the model. */
export async function retryScoring(actor: WeeklyActor, responseId: string, now: Date): Promise<void> {
  assertHr(actor)
  const response = await prisma.weeklyResponse.findUnique({ where: { id: responseId }, select: { revision: true } })
  if (!response) throw new WeeklyError('Answer not found', 404)
  const job = await prisma.weeklyScoringJob.findUnique({ where: { responseId_revision: { responseId, revision: response.revision } } })
  if (job?.status === 'RUNNING' && job.leaseUntil && job.leaseUntil > now) throw new WeeklyError('The model is scoring this answer right now', 409)
  await prisma.weeklyScoringJob.upsert({
    where: { responseId_revision: { responseId, revision: response.revision } },
    create: { responseId, revision: response.revision, runAfter: now },
    update: { status: 'PENDING', attempts: 0, error: null, runAfter: now, leaseToken: null, leaseUntil: null },
  })
  await recordAudit(prisma, { actorId: actor.id, actorRole: 'HR', action: 'ANSWER_RETRY', objectType: 'WeeklyResponse', objectId: responseId })
}


import { prisma } from '@/lib/db'
import { answerProblem, answerWordCount } from '../answer-rules'
import { AUTO_ACCEPT_MS, type AnswerState } from '../review-rules'
import type { CorrectionInput } from '../schemas'
import type { AiScoreView, ReviewActionValue, ReviewAnswerView, ReviewFilter, ReviewQueueResponse } from '../view-types'
import { ANSWER_CORRECTED, jsonStrings, loadAnswerRecords, type AnswerRecord } from './answer-states'
import { recordAudit } from './audit'
import { assertHr, loadPeople, personRef, type WeeklyActor } from './context'
import { loadCycle } from './cycles'
import { lockResponse } from './db'
import { WeeklyError } from './errors'

export const REVIEW_PAGE_SIZE = 50
export const REVIEW_FILTERS: readonly ReviewFilter[] = ['NEEDS_REVIEW', 'FAILED', 'AUTO_ACCEPT', 'FOLLOW_UP', 'SCORING', 'DECIDED']
const FILTER_BY_STATE: Record<AnswerState, ReviewFilter> = {
  NEEDS_REVIEW: 'NEEDS_REVIEW', FAILED: 'FAILED', AUTO_ACCEPT_PENDING: 'AUTO_ACCEPT', INSUFFICIENT: 'FOLLOW_UP', SCORING: 'SCORING', DECIDED: 'DECIDED',
}

export function filterOf(state: AnswerState): ReviewFilter {
  return FILTER_BY_STATE[state]
}

const time = (date: Date | null | undefined) => date?.getTime() ?? 0

function aiView(record: AnswerRecord, versions: ReadonlyMap<string, number>): AiScoreView | null {
  const ai = record.aiScore
  if (!ai) return null
  return {
    id: ai.id, sufficiency: ai.sufficiency as AiScoreView['sufficiency'], score: ai.score, confidence: ai.confidence as AiScoreView['confidence'],
    criteriaMet: jsonStrings(ai.criteriaMet), criteriaNotDemonstrated: jsonStrings(ai.criteriaNotDemonstrated), evidenceQuotes: jsonStrings(ai.evidenceQuotes),
    rationale: ai.rationale, followUpPrompt: ai.followUpPrompt, flags: jsonStrings(ai.flags), model: ai.model,
    profileVersion: versions.get(ai.profileId) ?? null, createdAt: ai.createdAt.toISOString(),
  }
}

export async function reviewViews(records: readonly AnswerRecord[]): Promise<ReviewAnswerView[]> {
  if (records.length === 0) return []
  const responses = await prisma.weeklyResponse.findMany({
    where: { id: { in: records.map((r) => r.responseId) } },
    include: { prompt: { select: { textSnapshot: true } } },
  })
  const byId = new Map(responses.map((r) => [r.id, r]))
  const profileIds = records.flatMap((r) => (r.aiScore ? [r.aiScore.profileId] : []))
  const versions = new Map((await prisma.weeklyProfile.findMany({ where: { id: { in: profileIds } }, select: { id: true, version: true } })).map((p) => [p.id, p.version]))
  const reviewerIds = records.flatMap((r) => (r.latestReview?.reviewerId ? [r.latestReview.reviewerId] : []))
  const people = await loadPeople([...records.flatMap((r) => [r.evaluatorId, r.evaluateeId]), ...reviewerIds])
  return records.flatMap((record): ReviewAnswerView[] => {
    const response = byId.get(record.responseId)
    if (!response) return []
    const review = record.latestReview
    return [{
      responseId: record.responseId, promptId: record.promptId, weekIndex: record.weekIndex, kind: record.kind, topic: record.topic, perspective: record.perspective,
      evaluator: personRef(people, record.evaluatorId), evaluatee: personRef(people, record.evaluateeId), question: response.prompt.textSnapshot,
      answer: { situation: response.situation, action: response.action, result: response.result, shortfall: response.shortfall, commentText: null },
      wordCount: answerWordCount(response), revision: record.revision, submittedAt: record.submittedAt?.toISOString() ?? null,
      state: record.state, reasons: record.reasons, ai: aiView(record, versions),
      decision: review && {
        id: review.id, action: review.action as ReviewActionValue, finalScore: review.finalScore, reason: review.reason,
        reviewerName: review.reviewerId ? personRef(people, review.reviewerId).name : null, createdAt: review.createdAt.toISOString(),
      },
      basedOn: { aiScoreId: record.aiScore?.id ?? null, reviewId: review?.id ?? null },
      autoAcceptAt: record.state === 'AUTO_ACCEPT_PENDING' && record.aiScore ? new Date(record.aiScore.createdAt.getTime() + AUTO_ACCEPT_MS).toISOString() : null,
      jobError: record.state === 'FAILED' ? record.job?.error ?? null : null,
    }]
  })
}

export async function reviewQueue(actor: WeeklyActor, input: { cycleId: string; filter: ReviewFilter }): Promise<ReviewQueueResponse> {
  assertHr(actor)
  await loadCycle(input.cycleId)
  const records = await loadAnswerRecords({ cycleId: input.cycleId })
  const counts = Object.fromEntries(REVIEW_FILTERS.map((filter) => [filter, 0])) as Record<ReviewFilter, number>
  for (const record of records) counts[filterOf(record.state)] += 1
  const matching = records.filter((r) => filterOf(r.state) === input.filter)
  // Oldest first for work queues; most recent decisions first for the log.
  const sorted = [...matching].sort((a, b) =>
    input.filter === 'DECIDED' ? time(b.latestReview?.createdAt) - time(a.latestReview?.createdAt) : time(a.submittedAt) - time(b.submittedAt),
  )
  return { cycleId: input.cycleId, filter: input.filter, counts, total: matching.length, items: await reviewViews(sorted.slice(0, REVIEW_PAGE_SIZE)) }
}

/** Spec 8.3: HR fixes a submitted answer's text (reason required, original kept in the audit log) and it is re-scored. */
export async function correctAnswer(actor: WeeklyActor, responseId: string, input: CorrectionInput, now: Date): Promise<{ revision: number }> {
  assertHr(actor)
  const problem = answerProblem({ situation: input.situation, action: input.action, result: input.result })
  if (problem) throw new WeeklyError(problem)
  return prisma.$transaction(async (tx) => {
    if (!(await lockResponse(tx, responseId))) throw new WeeklyError('Answer not found', 404)
    const response = await tx.weeklyResponse.findUniqueOrThrow({
      where: { id: responseId },
      include: { prompt: { select: { kind: true, status: true, cycleId: true, cycle: { select: { status: true } } } } },
    })
    if (response.prompt.kind === 'COMMENT' || response.prompt.status !== 'SUBMITTED') throw new WeeklyError('Only submitted, scored answers can be corrected', 409)
    if (response.prompt.cycle.status !== 'RUNNING') throw new WeeklyError('This quarter’s weekly evaluations are closed', 409)
    const revision = response.revision + 1
    const text = { situation: input.situation.trim(), action: input.action.trim(), result: input.result.trim(), shortfall: input.shortfall?.trim() || null }
    await tx.weeklyResponse.update({ where: { id: responseId }, data: { ...text, revision } })
    await tx.weeklyScoringJob.updateMany({ where: { responseId, status: 'PENDING' }, data: { status: 'CANCELLED', updatedAt: now } })
    await tx.weeklyScoringJob.create({ data: { responseId, revision } })
    await recordAudit(tx, {
      cycleId: response.prompt.cycleId, actorId: actor.id, actorRole: 'HR', action: ANSWER_CORRECTED, objectType: 'WeeklyResponse', objectId: responseId,
      before: { revision: response.revision, situation: response.situation, action: response.action, result: response.result, shortfall: response.shortfall },
      after: { revision, ...text }, reason: input.reason,
    })
    return { revision }
  })
}

export async function retryScoring(actor: WeeklyActor, responseId: string, now: Date): Promise<void> {
  assertHr(actor)
  const [record] = await loadAnswerRecords({ responseIds: [responseId] })
  if (!record || record.state !== 'FAILED' || !record.job) throw new WeeklyError('Only answers whose scoring failed can be retried', 409)
  const reset = await prisma.weeklyScoringJob.updateMany({
    where: { id: record.job.id, status: 'FAILED' },
    data: { status: 'PENDING', attempts: 0, runAfter: now, error: null, leaseToken: null, leaseUntil: null, updatedAt: now },
  })
  if (reset.count === 0) throw new WeeklyError('This answer changed. Reload to see the latest.', 409)
  await recordAudit(prisma, { cycleId: record.cycleId, actorId: actor.id, actorRole: 'HR', action: 'SCORING_RETRY', objectType: 'WeeklyResponse', objectId: responseId })
}

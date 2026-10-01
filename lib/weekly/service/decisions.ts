import type { Prisma, WeeklyReviewAction } from '@prisma/client'
import { prisma } from '@/lib/db'
import { isAutoAcceptDue } from '../review-rules'
import { isConfirmedAction, latestByResponse } from '../reviews'
import type { DecisionInput } from '../schemas'
import { loadAnswerRecords, type AnswerRecord } from './answer-states'
import { recordAudit } from './audit'
import { assertHr, type WeeklyActor } from './context'
import { findRunningCycle } from './cycles'
import { lockResponse } from './db'
import { WeeklyError } from './errors'

export const STALE_DECISION = 'This answer changed or someone else decided it first. Reload to see the latest.'

export interface DecisionResult { reviewId: string; action: WeeklyReviewAction }

/** A slot is satisfied while any of its answers' latest review is a confirmed score. */
export async function refreshSlotStatus(tx: Prisma.TransactionClient, slotId: string | null): Promise<void> {
  if (!slotId) return
  const slot = await tx.weeklySlot.findUnique({ where: { id: slotId } })
  if (!slot || slot.status === 'CANCELLED') return
  const responses = await tx.weeklyResponse.findMany({ where: { prompt: { slotId } }, select: { id: true } })
  const reviews = await tx.weeklyScoreReview.findMany({ where: { responseId: { in: responses.map((r) => r.id) } }, select: { id: true, responseId: true, createdAt: true, action: true } })
  const confirmed = [...latestByResponse(reviews).values()].some((review) => isConfirmedAction(review.action))
  if (confirmed && slot.status !== 'SATISFIED') {
    await tx.weeklySlot.update({ where: { id: slotId }, data: { status: 'SATISFIED' } })
  } else if (!confirmed && slot.status === 'SATISFIED') {
    await tx.weeklySlot.update({ where: { id: slotId }, data: { status: 'OPEN' } })
  }
}

function reviewData(record: AnswerRecord, input: DecisionInput, reviewerId: string, now: Date): Prisma.WeeklyScoreReviewUncheckedCreateInput {
  const base = { responseId: record.responseId, aiScoreId: record.aiScore?.id ?? null, reviewerId, reason: input.reason ?? null, createdAt: now }
  switch (input.action) {
    case 'ACCEPT': {
      const ai = record.aiScore
      if (!ai || ai.sufficiency !== 'SUFFICIENT' || ai.score === null) throw new WeeklyError('There is no AI score to accept. Set a score instead.', 409)
      return { ...base, action: 'ACCEPTED', finalScore: ai.score }
    }
    case 'SET_SCORE':
      return { ...base, action: record.aiScore ? 'ADJUSTED' : 'MANUAL', finalScore: input.score }
    case 'NOT_ENOUGH_EVIDENCE':
      return { ...base, action: 'MARKED_INSUFFICIENT', finalScore: null }
    case 'EXCLUDE':
      return { ...base, action: 'EXCLUDED', finalScore: null }
  }
}

export async function decideAnswer(actor: WeeklyActor, responseId: string, input: DecisionInput, now: Date): Promise<DecisionResult> {
  assertHr(actor)
  return prisma.$transaction(async (tx) => {
    if (!(await lockResponse(tx, responseId))) throw new WeeklyError('Answer not found', 404)
    const [record] = await loadAnswerRecords({ responseIds: [responseId] }, tx)
    if (!record) throw new WeeklyError('This answer is not scored, so there is nothing to decide', 409)
    const cycle = await tx.weeklyCycle.findUnique({ where: { id: record.cycleId }, select: { status: true } })
    if (cycle?.status !== 'RUNNING') throw new WeeklyError('This quarter’s weekly evaluations are closed', 409)
    if ((record.aiScore?.id ?? null) !== input.basedOn.aiScoreId || (record.latestReview?.id ?? null) !== input.basedOn.reviewId) {
      throw new WeeklyError(STALE_DECISION, 409)
    }
    if (record.state === 'SCORING') throw new WeeklyError('This answer is still being scored', 409)
    const review = await tx.weeklyScoreReview.create({ data: reviewData(record, input, actor.id, now) })
    await refreshSlotStatus(tx, record.slotId)
    await recordAudit(tx, {
      cycleId: record.cycleId, actorId: actor.id, actorRole: 'HR', action: `REVIEW_${input.action}`, objectType: 'WeeklyResponse', objectId: responseId,
      before: { state: record.state, aiScore: record.aiScore?.score ?? null }, after: { action: review.action, finalScore: review.finalScore }, reason: input.reason ?? null,
    })
    return { reviewId: review.id, action: review.action }
  })
}

/** Spec 8.1: scores nobody has to review are accepted 72 hours after scoring (or at once from the preview test tools). */
export async function autoAcceptDue(now: Date, options: { cycleId?: string; ignoreWait?: boolean } = {}): Promise<{ accepted: number }> {
  const cycleId = options.cycleId ?? (await findRunningCycle())?.id
  if (!cycleId) return { accepted: 0 }
  const due = (await loadAnswerRecords({ cycleId })).filter(
    (r) => r.state === 'AUTO_ACCEPT_PENDING' && r.aiScore !== null && (options.ignoreWait === true || isAutoAcceptDue(r.aiScore.createdAt, now)),
  )
  let accepted = 0
  for (const candidate of due) {
    const done = await prisma.$transaction(async (tx) => {
      await lockResponse(tx, candidate.responseId)
      const [record] = await loadAnswerRecords({ responseIds: [candidate.responseId] }, tx)
      // Re-checked under the lock: HR may have decided it, or the text may have changed, since the list was read.
      const ai = record?.aiScore
      if (!record || record.state !== 'AUTO_ACCEPT_PENDING' || !ai || ai.id !== candidate.aiScore?.id || ai.score === null) return false
      await tx.weeklyScoreReview.create({ data: { responseId: record.responseId, aiScoreId: ai.id, action: 'AUTO_ACCEPTED', finalScore: ai.score, reviewerId: null, createdAt: now } })
      await refreshSlotStatus(tx, record.slotId)
      return true
    })
    if (done) accepted += 1
  }
  return { accepted }
}

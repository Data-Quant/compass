import type { WeeklyChallenge } from '@prisma/client'
import { prisma } from '@/lib/db'
import { calculateWeightedScore } from '@/lib/scoring'
import { renderChallengeRaisedEmail, renderChallengeResolvedEmail } from '../emails'
import { formatKarachiDate } from '../format'
import type { PersonFacts } from '../eligibility'
import type { ChallengeDetailResponse, ChallengeRow, ChallengesResponse, ChallengeView, MyChallengeResponse } from '../view-types'
import { aggregateCycle } from './aggregate'
import { loadAnswerRecords } from './answer-states'
import { recordAudit } from './audit'
import { challengeDeadlineFor } from './challenge-window'
import { assertHr, loadPeople, personRef, type WeeklyActor } from './context'
import { loadCycle, type CycleWithPeriod } from './cycles'
import { isUniqueViolation, lockResponse } from './db'
import { WeeklyError } from './errors'
import { deliverOnce, hrUserIds, type WeeklySendMail } from './notifications'
import { reviewViews } from './review-queue'

/** A resolved challenge stays on the person's dashboard for 30 days. */
const RESOLVED_VISIBLE_MS = 30 * 24 * 60 * 60 * 1000

function challengeView(c: WeeklyChallenge): ChallengeView {
  return { id: c.id, status: c.status, reason: c.reason, resolution: c.resolution, createdAt: c.createdAt.toISOString(), resolvedAt: c.resolvedAt?.toISOString() ?? null }
}

function rowOf(c: WeeklyChallenge, people: ReadonlyMap<string, PersonFacts>): ChallengeRow {
  return { ...challengeView(c), evaluatee: personRef(people, c.evaluateeId), resolvedBy: c.resolvedById ? personRef(people, c.resolvedById).name : null }
}

/** The most recently published quarter and its challenge deadline. */
async function latestPublished(): Promise<{ cycle: CycleWithPeriod; deadline: Date } | null> {
  const row = await prisma.weeklyCycle.findFirst({ where: { status: 'CLOSED', resultsPublishedAt: { not: null } }, orderBy: { resultsPublishedAt: 'desc' } })
  if (!row?.resultsPublishedAt) return null
  return { cycle: await loadCycle(row.id), deadline: await challengeDeadlineFor(row.resultsPublishedAt) }
}

async function hasResults(periodId: string, userId: string): Promise<boolean> {
  return (await prisma.evaluation.count({ where: { periodId, evaluateeId: userId, submittedAt: { not: null } } })) > 0
}

export async function myChallenge(actor: WeeklyActor, now: Date): Promise<MyChallengeResponse> {
  const none: MyChallengeResponse = { available: false, periodName: null, deadline: null, canRaise: false, challenge: null }
  const published = await latestPublished()
  if (!published || !(await hasResults(published.cycle.periodId, actor.id))) return none
  const challenge = await prisma.weeklyChallenge.findUnique({ where: { cycleId_evaluateeId: { cycleId: published.cycle.id, evaluateeId: actor.id } } })
  const windowOpen = now <= published.deadline
  const shown = challenge
    ? challenge.status === 'OPEN' || (challenge.resolvedAt !== null && now.getTime() - challenge.resolvedAt.getTime() <= RESOLVED_VISIBLE_MS)
    : windowOpen
  if (!shown) return none
  return { available: true, periodName: published.cycle.period.name, deadline: published.deadline.toISOString(), canRaise: !challenge && windowOpen, challenge: challenge ? challengeView(challenge) : null }
}

export async function raiseChallenge(actor: WeeklyActor, input: { reason: string }, now: Date, send: WeeklySendMail, appUrl: string): Promise<ChallengeView> {
  const published = await latestPublished()
  if (!published || !(await hasResults(published.cycle.periodId, actor.id))) throw new WeeklyError('There are no published results for you to challenge', 404)
  if (now > published.deadline) throw new WeeklyError(`The challenge window closed on ${formatKarachiDate(published.deadline.toISOString())}`, 409)
  let challenge: WeeklyChallenge
  try {
    challenge = await prisma.weeklyChallenge.create({ data: { cycleId: published.cycle.id, evaluateeId: actor.id, reason: input.reason.trim(), createdAt: now } })
  } catch (error) {
    if (isUniqueViolation(error)) throw new WeeklyError('You have already raised a challenge for this quarter', 409)
    throw error
  }
  await recordAudit(prisma, { cycleId: published.cycle.id, actorId: actor.id, actorRole: 'EMPLOYEE', action: 'CHALLENGE_RAISED', objectType: 'WeeklyChallenge', objectId: challenge.id })
  const periodName = published.cycle.period.name
  await deliverOnce(
    (await hrUserIds()).map((userId) => ({
      userId, kind: 'weekly-challenge-new' as const, dedupeKey: `weekly-challenge-new:${userId}:${challenge.id}`,
      render: (name: string) => renderChallengeRaisedEmail({ name, evaluatee: actor.name, periodName, appUrl }),
    })),
    send,
  )
  return challengeView(challenge)
}

export async function challengesView(actor: WeeklyActor, cycleId: string): Promise<ChallengesResponse> {
  assertHr(actor)
  const cycle = await loadCycle(cycleId)
  const rows = await prisma.weeklyChallenge.findMany({ where: { cycleId }, orderBy: [{ status: 'asc' }, { createdAt: 'asc' }] })
  const people = await loadPeople(rows.flatMap((r) => [r.evaluateeId, ...(r.resolvedById ? [r.resolvedById] : [])]))
  return {
    cycleId,
    deadline: cycle.resultsPublishedAt ? (await challengeDeadlineFor(cycle.resultsPublishedAt)).toISOString() : null,
    challenges: rows.map((r) => rowOf(r, people)),
  }
}

async function findChallenge(challengeId: string): Promise<WeeklyChallenge> {
  const challenge = await prisma.weeklyChallenge.findUnique({ where: { id: challengeId } })
  if (!challenge) throw new WeeklyError('Challenge not found', 404)
  return challenge
}

async function openChallenge(challengeId: string): Promise<WeeklyChallenge> {
  const challenge = await findChallenge(challengeId)
  if (challenge.status !== 'OPEN') throw new WeeklyError('This challenge was already resolved', 409)
  return challenge
}

/** The person's decided weekly answers, with evaluator names (HR only), and their current overall score. */
export async function challengeDetail(actor: WeeklyActor, challengeId: string): Promise<ChallengeDetailResponse> {
  assertHr(actor)
  const challenge = await findChallenge(challengeId)
  const cycle = await loadCycle(challenge.cycleId)
  const records = (await loadAnswerRecords({ cycleId: cycle.id })).filter((r) => r.evaluateeId === challenge.evaluateeId && r.latestReview !== null)
  const people = await loadPeople([challenge.evaluateeId, ...(challenge.resolvedById ? [challenge.resolvedById] : [])])
  let overallScore: number | null = null
  try {
    overallScore = (await calculateWeightedScore(challenge.evaluateeId, cycle.periodId)).overallScore
  } catch (error) {
    console.error('[weekly] could not score a challenged person', { challengeId, error })
  }
  return { challenge: rowOf(challenge, people), overallScore, answers: await reviewViews(records) }
}

export async function adjustForChallenge(
  actor: WeeklyActor,
  challengeId: string,
  input: { responseId: string; score: number; reason: string },
  now: Date,
): Promise<{ reviewId: string }> {
  assertHr(actor)
  const challenge = await openChallenge(challengeId)
  return prisma.$transaction(async (tx) => {
    if (!(await lockResponse(tx, input.responseId))) throw new WeeklyError('Answer not found', 404)
    const [record] = await loadAnswerRecords({ responseIds: [input.responseId] }, tx)
    if (!record || record.cycleId !== challenge.cycleId || record.evaluateeId !== challenge.evaluateeId) throw new WeeklyError('That answer is not part of this challenge', 404)
    const review = await tx.weeklyScoreReview.create({
      data: {
        responseId: record.responseId, aiScoreId: record.aiScore?.id ?? null, action: record.aiScore ? 'ADJUSTED' : 'MANUAL',
        finalScore: input.score, reason: `Challenge: ${input.reason}`, reviewerId: actor.id, createdAt: now,
      },
    })
    await recordAudit(tx, {
      cycleId: challenge.cycleId, actorId: actor.id, actorRole: 'HR', action: 'CHALLENGE_ADJUST', objectType: 'WeeklyChallenge', objectId: challengeId,
      before: { responseId: record.responseId, finalScore: record.latestReview?.finalScore ?? null }, after: { responseId: record.responseId, finalScore: input.score }, reason: input.reason,
    })
    return { reviewId: review.id }
  })
}

export async function resolveChallenge(
  actor: WeeklyActor,
  challengeId: string,
  input: { outcome: 'UPHELD' | 'NOT_UPHELD'; resolution: string },
  now: Date,
  send: WeeklySendMail,
  appUrl: string,
): Promise<{ reaggregated: boolean }> {
  assertHr(actor)
  const challenge = await openChallenge(challengeId)
  const cycle = await loadCycle(challenge.cycleId)
  const adjustments = await prisma.weeklyAuditEvent.count({ where: { action: 'CHALLENGE_ADJUST', objectId: challengeId } })
  // The person is told the outcome, so it has to match what happened: upheld with changed scores, or not upheld with none.
  if (input.outcome === 'UPHELD' && adjustments === 0) throw new WeeklyError('Change at least one score before upholding this challenge, or resolve it as not upheld.', 409)
  if (input.outcome === 'NOT_UPHELD' && adjustments > 0) throw new WeeklyError('You changed scores for this challenge, so resolve it as upheld.', 409)
  await prisma.$transaction(
    async (tx) => {
      const moved = await tx.weeklyChallenge.updateMany({
        where: { id: challengeId, status: 'OPEN' },
        data: { status: input.outcome, resolution: input.resolution.trim(), resolvedById: actor.id, resolvedAt: now },
      })
      if (moved.count === 0) throw new WeeklyError('This challenge was already resolved', 409)
      if (adjustments > 0) {
        await aggregateCycle(tx, cycle, { runById: actor.id, now, drops: [], evaluateeIds: [challenge.evaluateeId] })
        // The cached report is rebuilt from the new rows the next time it is generated; HR re-sends it from the Email page.
        await tx.report.deleteMany({ where: { periodId: cycle.periodId, employeeId: challenge.evaluateeId } })
      }
      await recordAudit(tx, {
        cycleId: cycle.id, actorId: actor.id, actorRole: 'HR', action: 'CHALLENGE_RESOLVE', objectType: 'WeeklyChallenge', objectId: challengeId,
        after: { outcome: input.outcome, adjustments }, reason: input.resolution,
      })
    },
    { timeout: 60_000 },
  )
  await deliverOnce(
    [{
      userId: challenge.evaluateeId, kind: 'weekly-challenge-resolved', dedupeKey: `weekly-challenge-resolved:${challengeId}`,
      render: (name: string) => renderChallengeResolvedEmail({ name, periodName: cycle.period.name, upheld: input.outcome === 'UPHELD', resolution: input.resolution.trim(), appUrl }),
    }],
    send,
  )
  return { reaggregated: adjustments > 0 }
}

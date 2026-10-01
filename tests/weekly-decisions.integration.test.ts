import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { fakeModel } from '../lib/weekly/ai/model'
import { isSampled } from '../lib/weekly/review-rules'
import { decisionSchema } from '../lib/weekly/schemas'
import { loadAnswerRecords } from '../lib/weekly/service/answer-states'
import { autoAcceptDue, decideAnswer, STALE_DECISION } from '../lib/weekly/service/decisions'
import { WeeklyError } from '../lib/weekly/service/errors'
import { historyView } from '../lib/weekly/service/inbox'
import { releaseWeek } from '../lib/weekly/service/release'
import { runScoring } from '../lib/weekly/service/scoring'
import { answerAs, releaseWeekOne, scoringClock } from './helpers/weekly-answers'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const HOUR = 60 * 60 * 1000
const isStatus = (status: number, message?: string) => (e: unknown) => e instanceof WeeklyError && e.status === status && (!message || e.message === message)
let cycleId = ''
before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  const { periodId } = await seedWeeklyBase(prisma)
  ;({ cycleId } = await startedCycle(periodId))
})
after(async () => {
  await prisma.$disconnect()
})

const score = () => runScoring({ model: fakeModel(), budgetMs: 30_000, clock: () => scoringClock() })
const record = async (responseId: string) => (await loadAnswerRecords({ responseIds: [responseId] }))[0]
const basedOn = async (responseId: string) => {
  const r = await record(responseId)
  return { aiScoreId: r.aiScore?.id ?? null, reviewId: r.latestReview?.id ?? null }
}
const promptOf = async (evaluatorId: string) => (await releaseWeekOne(cycleId)).find((p) => p.evaluatorId === evaluatorId)!
const slotOf = (responseId: string) => prisma.weeklyResponse.findUniqueOrThrow({ where: { id: responseId }, include: { prompt: { include: { slot: true } } } }).then((r) => r.prompt.slot!)
const historyStatus = async (evaluatorId: string, promptId: string) =>
  (await historyView(evaluatorId)).groups.flatMap((g) => g.entries).find((e) => e.id === promptId)?.status

test('decision input: scores are 1–4, and adjusting or excluding needs a reason', () => {
  const on = { aiScoreId: 'a', reviewId: null }
  assert.equal(decisionSchema.safeParse({ action: 'SET_SCORE', basedOn: on, score: 5, reason: 'Too high' }).success, false)
  assert.equal(decisionSchema.safeParse({ action: 'SET_SCORE', basedOn: on, score: 3 }).success, false)
  assert.equal(decisionSchema.safeParse({ action: 'EXCLUDE', basedOn: on, reason: ' ' }).success, false)
  assert.equal(decisionSchema.safeParse({ action: 'ACCEPT', basedOn: on }).success, true)
})

test('a proposed 4 waits for HR; accepting it satisfies the slot and the evaluator sees "accepted"', WEEKLY_DB_TEST, async () => {
  const prompt = await promptOf(W.lead.id)
  const responseId = await answerAs(prompt, 'strong')
  await score()
  const before = await record(responseId)
  assert.equal(before.state, 'NEEDS_REVIEW')
  assert.ok(before.reasons.includes('EXTREME_SCORE'))
  const result = await decideAnswer(HR_ACTOR, responseId, { action: 'ACCEPT', basedOn: await basedOn(responseId) }, at(1, 3))
  assert.equal(result.action, 'ACCEPTED')
  const review = await prisma.weeklyScoreReview.findUniqueOrThrow({ where: { id: result.reviewId } })
  assert.deepEqual([review.finalScore, review.reviewerId, review.aiScoreId], [4, W.hr.id, before.aiScore!.id])
  assert.equal((await record(responseId)).state, 'DECIDED')
  assert.equal((await slotOf(responseId)).status, 'SATISFIED')
  assert.equal(await historyStatus(W.lead.id, prompt.id), 'ACCEPTED')
  assert.equal(await prisma.weeklyAuditEvent.count({ where: { action: 'REVIEW_ACCEPT', objectId: responseId } }), 1)
})

test('two decisions made from the same view: the first stands, the second is refused', WEEKLY_DB_TEST, async () => {
  const responseId = await answerAs(await promptOf(W.lead.id), 'strong')
  await score()
  const on = await basedOn(responseId)
  const results = await Promise.allSettled([
    decideAnswer(HR_ACTOR, responseId, { action: 'ACCEPT', basedOn: on }, at(1, 3)),
    decideAnswer(HR_ACTOR, responseId, { action: 'SET_SCORE', score: 3, reason: 'One example only', basedOn: on }, at(1, 3)),
  ])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
  assert.ok(isStatus(409, STALE_DECISION)(rejected.reason))
  assert.equal(await prisma.weeklyScoreReview.count({ where: { responseId } }), 1)
})

test('HR adjusts, marks not enough evidence (no new question) and excludes; only HR may decide', WEEKLY_DB_TEST, async () => {
  const prompt = await promptOf(W.lead.id)
  const responseId = await answerAs(prompt, 'strong')
  await score()
  await assert.rejects(decideAnswer(weeklyActor(W.lead), responseId, { action: 'ACCEPT', basedOn: await basedOn(responseId) }, at(1, 3)), isStatus(403))
  const adjusted = await decideAnswer(HR_ACTOR, responseId, { action: 'SET_SCORE', score: 3, reason: 'One example, not yet a pattern', basedOn: await basedOn(responseId) }, at(1, 3))
  assert.equal(adjusted.action, 'ADJUSTED')
  assert.equal((await slotOf(responseId)).status, 'SATISFIED')
  const prompts = await prisma.weeklyPrompt.count({ where: { cycleId } })
  const marked = await decideAnswer(HR_ACTOR, responseId, { action: 'NOT_ENOUGH_EVIDENCE', basedOn: await basedOn(responseId) }, at(1, 4))
  assert.equal(marked.action, 'MARKED_INSUFFICIENT')
  assert.equal((await slotOf(responseId)).status, 'OPEN')
  assert.equal(await prisma.weeklyPrompt.count({ where: { cycleId } }), prompts, 'the evaluator is not asked again')
  assert.equal(await historyStatus(W.lead.id, prompt.id), 'NOT_USED')
  const excluded = await decideAnswer(HR_ACTOR, responseId, { action: 'EXCLUDE', reason: 'Describes a different person', basedOn: await basedOn(responseId) }, at(1, 5))
  assert.equal(excluded.action, 'EXCLUDED')
  assert.equal(await historyStatus(W.lead.id, prompt.id), 'NOT_USED')
})

test('there is nothing to accept on a thin answer, but HR can score it by hand', WEEKLY_DB_TEST, async () => {
  const responseId = await answerAs(await promptOf(W.ana.id), 'praise')
  await score()
  assert.deepEqual((await record(responseId)).reasons, ['NOT_ENOUGH_EVIDENCE'])
  await assert.rejects(decideAnswer(HR_ACTOR, responseId, { action: 'ACCEPT', basedOn: await basedOn(responseId) }, at(1, 3)), isStatus(409))
  const set = await decideAnswer(HR_ACTOR, responseId, { action: 'SET_SCORE', score: 2, reason: 'Known from the project review', basedOn: await basedOn(responseId) }, at(1, 3))
  assert.equal(set.action, 'ADJUSTED')
})

test('when scoring fails, HR scores the answer by hand', WEEKLY_DB_TEST, async () => {
  const responseId = await answerAs(await promptOf(W.ben.id), 'solid')
  await runScoring({ model: null, budgetMs: 10_000, clock: () => scoringClock() })
  const failed = await record(responseId)
  assert.deepEqual([failed.state, failed.reasons], ['FAILED', ['SCORING_FAILED']])
  const manual = await decideAnswer(HR_ACTOR, responseId, { action: 'SET_SCORE', score: 3, reason: 'Scored by hand', basedOn: { aiScoreId: null, reviewId: null } }, at(1, 3))
  assert.equal(manual.action, 'MANUAL')
  assert.equal((await record(responseId)).state, 'DECIDED')
})

test('unflagged scores are accepted after 72 hours; flagged and sensitive ones never are', WEEKLY_DB_TEST, async () => {
  const prompts = await releaseWeekOne(cycleId)
  const ids = new Map<string, string>()
  for (const prompt of prompts) ids.set(prompt.evaluatorId, await answerAs(prompt, prompt.evaluatorId === W.ana.id ? 'sensitive' : 'solid'))
  await score()
  const plain = [ids.get(W.lead.id)!, ids.get(W.ben.id)!]
  const expected = plain.filter((id) => !isSampled(id))
  assert.equal((await autoAcceptDue(new Date(scoringClock().getTime() + 71 * HOUR), { cycleId })).accepted, 0)
  assert.equal((await autoAcceptDue(new Date(scoringClock().getTime() + 72 * HOUR), { cycleId })).accepted, expected.length)
  for (const id of expected) {
    const review = await prisma.weeklyScoreReview.findFirstOrThrow({ where: { responseId: id } })
    assert.deepEqual([review.action, review.reviewerId, review.finalScore], ['AUTO_ACCEPTED', null, 2])
    assert.equal((await slotOf(id)).status, 'SATISFIED')
  }
  const sensitive = await record(ids.get(W.ana.id)!)
  assert.equal(sensitive.state, 'NEEDS_REVIEW')
  assert.ok(sensitive.reasons.includes('FLAGGED'))
  assert.equal((await autoAcceptDue(new Date(scoringClock().getTime() + 500 * HOUR), { cycleId })).accepted, 0)
})

test('auto-accept racing an HR decision on the same answer leaves exactly one decision', WEEKLY_DB_TEST, async () => {
  const responseId = await answerAs(await promptOf(W.lead.id), 'solid')
  await score()
  const on = await basedOn(responseId)
  await Promise.allSettled([
    autoAcceptDue(new Date(scoringClock().getTime() + 73 * HOUR), { cycleId }),
    decideAnswer(HR_ACTOR, responseId, { action: 'ACCEPT', basedOn: on }, new Date(scoringClock().getTime() + 73 * HOUR)),
  ])
  assert.equal(await prisma.weeklyScoreReview.count({ where: { responseId } }), 1)
})

test('a slot whose answer awaits a decision is not asked again until it is decided', WEEKLY_DB_TEST, async () => {
  const prompt = await promptOf(W.lead.id)
  const responseId = await answerAs(prompt, 'solid')
  // Leave the answered slot as the lead's only open slot, so nothing else competes for the question.
  await prisma.weeklySlot.updateMany({ where: { cycleId, evaluatorId: W.lead.id, id: { not: prompt.slotId! } }, data: { status: 'CLOSED_NOT_OBSERVED' } })
  await releaseWeek(cycleId, 4, at(4))
  assert.equal(await prisma.weeklyPrompt.count({ where: { cycleId, evaluatorId: W.lead.id, weekIndex: 4 } }), 0)
  await score()
  await decideAnswer(HR_ACTOR, responseId, { action: 'EXCLUDE', reason: 'Not about this topic', basedOn: await basedOn(responseId) }, at(4, 2))
  await releaseWeek(cycleId, 5, at(5))
  const asked = await prisma.weeklyPrompt.findMany({ where: { cycleId, evaluatorId: W.lead.id, weekIndex: 5 } })
  assert.deepEqual(asked.map((p) => p.slotId), [prompt.slotId])
})

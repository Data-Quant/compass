import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { fakeModel } from '../lib/weekly/ai/model'
import { loadAnswerRecords } from '../lib/weekly/service/answer-states'
import { decideAnswer } from '../lib/weekly/service/decisions'
import { weeklyOverviewProgress, weeklyPairTopics } from '../lib/weekly/service/overview-progress'
import { runScoring } from '../lib/weekly/service/scoring'
import { answerAs, releaseWeekOne, scoringClock } from './helpers/weekly-answers'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST } from './helpers/weekly-test-db'

let periodId = ''
let cycleId = ''
before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  ;({ periodId } = await seedWeeklyBase(prisma))
  ;({ cycleId } = await startedCycle(periodId))
})
after(async () => {
  await prisma.$disconnect()
})

test('HR overview: evaluating others moves on answering, being evaluated moves on acceptance', WEEKLY_DB_TEST, async () => {
  const prompt = (await releaseWeekOne(cycleId)).find((p) => p.evaluatorId === W.lead.id)!
  const start = (await weeklyOverviewProgress(periodId))!
  const lead = start.get(W.lead.id)!
  const evaluatee = start.get(prompt.evaluateeId)!
  assert.ok(lead.topicsToAnswer > 0 && evaluatee.topics > 0)
  assert.deepEqual([lead.answeredTopics, evaluatee.coveredTopics], [0, 0])

  const responseId = await answerAs(prompt, 'strong')
  const answered = (await weeklyOverviewProgress(periodId))!
  assert.equal(answered.get(W.lead.id)!.answeredTopics, 1)
  assert.equal(answered.get(prompt.evaluateeId)!.coveredTopics, 0, 'an answer alone does not cover a topic')

  await runScoring({ model: fakeModel(), budgetMs: 30_000, clock: () => scoringClock() })
  const [record] = await loadAnswerRecords({ responseIds: [responseId] })
  await decideAnswer(HR_ACTOR, responseId, { action: 'ACCEPT', basedOn: { aiScoreId: record.aiScore?.id ?? null, reviewId: record.latestReview?.id ?? null } }, at(1, 3))
  const accepted = (await weeklyOverviewProgress(periodId))!
  assert.equal(accepted.get(prompt.evaluateeId)!.coveredTopics, 1)
  assert.ok(accepted.get(prompt.evaluateeId)!.evaluators >= 1)
})

test('a period without a weekly cycle has no weekly progress', WEEKLY_DB_TEST, async () => {
  assert.equal(await weeklyOverviewProgress('no-such-period'), null)
})

test('per pair, while the quarter runs: topics answered and covered for each evaluator and person', WEEKLY_DB_TEST, async () => {
  const prompt = (await releaseWeekOne(cycleId)).find((p) => p.evaluatorId === W.lead.id)!
  await answerAs(prompt, 'strong')
  const pairs = (await weeklyPairTopics(periodId))!
  const pair = pairs.get(`${W.lead.id}|${prompt.evaluateeId}|${prompt.relationshipType}`)!
  assert.ok(pair.total > 1)
  assert.deepEqual([pair.answered, pair.covered], [1, 0])
  await prisma.weeklyCycle.update({ where: { id: cycleId }, data: { status: 'CLOSED', closedAt: at(13) } })
  assert.equal(await weeklyPairTopics(periodId), null, 'after close the results speak for themselves')
})

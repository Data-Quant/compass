import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { weeklyOverviewProgress } from '../lib/weekly/service/overview-progress'
import { answerAs, releaseWeekOne } from './helpers/weekly-answers'
import { startedCycle } from './helpers/weekly-fixtures'
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

test('HR overview: an answer moves both the evaluator’s and the evaluated person’s progress', WEEKLY_DB_TEST, async () => {
  const prompt = (await releaseWeekOne(cycleId)).find((p) => p.evaluatorId === W.lead.id)!
  const start = (await weeklyOverviewProgress(periodId))!
  const lead = start.get(W.lead.id)!
  const evaluatee = start.get(prompt.evaluateeId)!
  assert.ok(lead.topicsToAnswer > 0 && evaluatee.topics > 0)
  assert.deepEqual([lead.answeredTopics, evaluatee.coveredTopics], [0, 0])

  await answerAs(prompt, 3)
  const answered = (await weeklyOverviewProgress(periodId))!
  assert.equal(answered.get(W.lead.id)!.answeredTopics, 1)
  assert.equal(answered.get(prompt.evaluateeId)!.coveredTopics, 1, 'a chosen statement covers the topic at once')
  assert.ok(answered.get(prompt.evaluateeId)!.evaluators >= 1)
})

test('a period without a weekly cycle has no weekly progress', WEEKLY_DB_TEST, async () => {
  assert.equal(await weeklyOverviewProgress('no-such-period'), null)
})

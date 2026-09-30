import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { fakeModel } from '../lib/weekly/ai/model'
import { loadAnswerRecords } from '../lib/weekly/service/answer-states'
import { decideAnswer } from '../lib/weekly/service/decisions'
import { WeeklyError } from '../lib/weekly/service/errors'
import { personScoreView } from '../lib/weekly/service/person-score'
import { runScoring } from '../lib/weekly/service/scoring'
import { answerAs, releaseWeekOne, scoringClock } from './helpers/weekly-answers'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

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

test('HR watches the AI score an answer about a person, then the running score move once it is accepted', WEEKLY_DB_TEST, async () => {
  const prompt = (await releaseWeekOne(cycleId)).find((p) => p.evaluatorId === W.lead.id)!
  const responseId = await answerAs(prompt, 'strong')
  const submitted = await personScoreView(HR_ACTOR, cycleId, prompt.evaluateeId)
  assert.equal(submitted.answers.length, 1)
  assert.deepEqual([submitted.answers[0].evaluator.name, submitted.answers[0].aiScore, submitted.answers[0].state], [W.lead.name, null, 'SCORING'])
  assert.equal(submitted.provisional.score, null)

  await runScoring({ model: fakeModel(), budgetMs: 30_000, clock: () => scoringClock() })
  const scored = await personScoreView(HR_ACTOR, cycleId, prompt.evaluateeId)
  const ai = scored.answers[0].aiScore
  assert.equal(typeof ai, 'number')
  assert.equal(scored.answers[0].finalScore, null)
  assert.equal(scored.provisional.score, null, 'an AI proposal alone never moves the score')

  const [record] = await loadAnswerRecords({ responseIds: [responseId] })
  await decideAnswer(HR_ACTOR, responseId, { action: 'ACCEPT', basedOn: { aiScoreId: record.aiScore?.id ?? null, reviewId: record.latestReview?.id ?? null } }, at(1, 3))
  const accepted = await personScoreView(HR_ACTOR, cycleId, prompt.evaluateeId)
  assert.equal(accepted.answers[0].finalScore, ai)
  assert.equal(accepted.provisional.score, ai)
  assert.deepEqual(accepted.provisional.byRelationship.map((r) => [r.relationshipType, r.count, r.average]), [[prompt.relationshipType === 'CROSS_DEPARTMENT' ? 'PEER' : prompt.relationshipType, 1, ai]])
  assert.ok(accepted.people.some((p) => p.id === prompt.evaluateeId))
})

test('only HR sees running scores', WEEKLY_DB_TEST, async () => {
  await assert.rejects(personScoreView(weeklyActor(W.lead), cycleId, W.ana.id), (e: unknown) => e instanceof WeeklyError && e.status === 403)
})

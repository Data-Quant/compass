import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { fakeModel } from '../lib/weekly/ai/model'
import { AUTO_ACCEPT_MS } from '../lib/weekly/review-rules'
import { loadAnswerRecords } from '../lib/weekly/service/answer-states'
import { autoAcceptDue, decideAnswer } from '../lib/weekly/service/decisions'
import { WeeklyError } from '../lib/weekly/service/errors'
import { submitAnswer } from '../lib/weekly/service/inbox'
import { correctAnswer, retryScoring, reviewQueue } from '../lib/weekly/service/review-queue'
import { runScoring } from '../lib/weekly/service/scoring'
import { answerAs, answerFor, releaseWeekOne, scoringClock } from './helpers/weekly-answers'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
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

const score = (model: Parameters<typeof runScoring>[0]['model'] = fakeModel(), when: Date = scoringClock()) => runScoring({ model, budgetMs: 30_000, clock: () => when })
const answered = async () => {
  const prompts = await releaseWeekOne(cycleId)
  const byEvaluator = new Map(prompts.map((p) => [p.evaluatorId, p]))
  const lead = await answerAs(byEvaluator.get(W.lead.id)!, 'strong')
  const ana = await answerAs(byEvaluator.get(W.ana.id)!, 'praise')
  const ben = await answerAs(byEvaluator.get(W.ben.id)!, 'solid')
  return { prompts: byEvaluator, lead, ana, ben }
}

test('the queue sorts answers by state, counts each, and shows HR who wrote what and why it is queued', WEEKLY_DB_TEST, async () => {
  const { prompts, lead, ben } = await answered()
  await score()
  await assert.rejects(reviewQueue(weeklyActor(W.lead), { cycleId, filter: 'NEEDS_REVIEW' }), isStatus(403))
  const queue = await reviewQueue(HR_ACTOR, { cycleId, filter: 'NEEDS_REVIEW' })
  assert.equal(queue.counts.NEEDS_REVIEW + queue.counts.AUTO_ACCEPT, 3)
  const item = queue.items.find((i) => i.responseId === lead)!
  assert.equal(item.evaluator.name, W.lead.name)
  assert.equal(item.evaluatee.id, prompts.get(W.lead.id)!.evaluateeId)
  assert.equal(item.question, prompts.get(W.lead.id)!.textSnapshot)
  assert.match(item.answer.situation, /Project Kestrel/)
  assert.ok(item.wordCount >= 40)
  assert.deepEqual([item.ai?.score, item.ai?.profileVersion, item.state], [4, 1, 'NEEDS_REVIEW'])
  assert.ok(item.reasons.includes('EXTREME_SCORE'))
  assert.deepEqual(item.basedOn, { aiScoreId: item.ai!.id, reviewId: null })
  assert.equal(item.autoAcceptAt, null)
  if (queue.counts.AUTO_ACCEPT === 1) {
    const waiting = (await reviewQueue(HR_ACTOR, { cycleId, filter: 'AUTO_ACCEPT' })).items[0]
    assert.equal(waiting.responseId, ben)
    assert.equal(waiting.autoAcceptAt, new Date(scoringClock().getTime() + AUTO_ACCEPT_MS).toISOString())
  }
})

test('decided answers show the decision and who made it', WEEKLY_DB_TEST, async () => {
  const { lead } = await answered()
  await score()
  const item = (await reviewQueue(HR_ACTOR, { cycleId, filter: 'NEEDS_REVIEW' })).items.find((i) => i.responseId === lead)!
  await decideAnswer(HR_ACTOR, lead, { action: 'ACCEPT', basedOn: item.basedOn }, at(1, 3))
  const decided = (await reviewQueue(HR_ACTOR, { cycleId, filter: 'DECIDED' })).items.find((i) => i.responseId === lead)!
  assert.deepEqual([decided.decision?.action, decided.decision?.finalScore, decided.decision?.reviewerName], ['ACCEPTED', 4, W.hr.name])
})

test('HR corrects an answer’s text: it is re-scored and comes back to HR, and the original is kept in the audit log', WEEKLY_DB_TEST, async () => {
  const { prompts, lead } = await answered()
  await score()
  const item = (await reviewQueue(HR_ACTOR, { cycleId, filter: 'NEEDS_REVIEW' })).items.find((i) => i.responseId === lead)!
  await decideAnswer(HR_ACTOR, lead, { action: 'ACCEPT', basedOn: item.basedOn }, at(1, 3))
  const corrected = { ...answerFor('solid', prompts.get(W.lead.id)!), reason: 'Removed a client’s confidential figure' }
  await assert.rejects(correctAnswer(HR_ACTOR, lead, { ...corrected, result: '' }, at(1, 4)), isStatus(400))
  assert.deepEqual(await correctAnswer(HR_ACTOR, lead, corrected, at(1, 4)), { revision: 2 })
  assert.equal((await loadAnswerRecords({ responseIds: [lead] }))[0].state, 'SCORING')
  // Scored after the earlier decision: a review only decides the AI score it follows.
  await score(fakeModel(), at(1, 5))
  const [record] = await loadAnswerRecords({ responseIds: [lead] })
  assert.deepEqual([record.state, record.aiScore?.revision, record.aiScore?.score], ['NEEDS_REVIEW', 2, 2])
  assert.ok(record.reasons.includes('CORRECTED'))
  const audit = await prisma.weeklyAuditEvent.findFirstOrThrow({ where: { action: 'ANSWER_CORRECTED', objectId: lead } })
  assert.match(JSON.stringify(audit.before), /Project Kestrel/)
  assert.equal(audit.reason, 'Removed a client’s confidential figure')
})

test('only answers whose scoring failed can be retried; a retry scores them', WEEKLY_DB_TEST, async () => {
  const { ben } = await answered()
  await score(null)
  await retryScoring(HR_ACTOR, ben, at(1, 3))
  const job = await prisma.weeklyScoringJob.findFirstOrThrow({ where: { responseId: ben } })
  assert.deepEqual([job.status, job.attempts, job.error], ['PENDING', 0, null])
  await score()
  assert.notEqual((await loadAnswerRecords({ responseIds: [ben] }))[0].state, 'FAILED')
  await assert.rejects(retryScoring(HR_ACTOR, ben, at(1, 3)), isStatus(409))
})

test('a correction made before any review comes back to HR whatever the new score, and the evaluator can no longer edit it', WEEKLY_DB_TEST, async () => {
  const { prompts, ben } = await answered()
  await score()
  const benPrompt = prompts.get(W.ben.id)!
  const solid = answerFor('solid', benPrompt)
  const corrected = { ...solid, result: `${solid.result} The finance lead thanked them for it.`, reason: 'Removed a client’s confidential figure' }
  await correctAnswer(HR_ACTOR, ben, corrected, at(1, 2, 10))
  await score(fakeModel(), at(1, 2, 11))
  const [record] = await loadAnswerRecords({ responseIds: [ben] })
  assert.equal(record.state, 'NEEDS_REVIEW')
  assert.ok(record.reasons.includes('CORRECTED'), `reasons: ${record.reasons.join(', ')}`)
  assert.equal((await autoAcceptDue(new Date(at(1, 2, 11).getTime() + 100 * 60 * 60 * 1000), { cycleId })).accepted, 0)
  await assert.rejects(
    submitAnswer(weeklyActor(W.ben), { evaluatorId: W.ben.id, actingAs: false }, benPrompt.id, solid, at(1, 2, 12)),
    isStatus(409),
  )
})

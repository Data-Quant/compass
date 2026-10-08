import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { fakeModel, ModelError, type ModelRequest, type StructuredModel } from '../lib/weekly/ai/model'
import { loadAnswerRecords } from '../lib/weekly/service/answer-states'
import { aiSettingsView, resolveActiveModel, setActiveModel } from '../lib/weekly/service/ai-settings'
import { closeCycle, closeView } from '../lib/weekly/service/close'
import { WeeklyError } from '../lib/weekly/service/errors'
import { historyView, inboxView } from '../lib/weekly/service/inbox'
import { decideAnswer, retryScoring, reviewQueue } from '../lib/weekly/service/review-queue'
import { releaseWeek } from '../lib/weekly/service/release'
import { roundView } from '../lib/weekly/service/round'
import { runScoring } from '../lib/weekly/service/scoring'
import { scoreNow } from '../lib/weekly/service/test-tools'
import { answerAs, releaseWeekOne } from './helpers/weekly-answers'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const isStatus = (status: number, pattern?: RegExp) => (e: unknown) => e instanceof WeeklyError && e.status === status && (!pattern || pattern.test(e.message))
let cycleId = ''
let periodId = ''

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
  delete process.env.FIREWORKS_API_KEY
  delete process.env.FIREWORKS_MODEL
  await prisma.$disconnect()
})

const score = (model: StructuredModel = fakeModel(), when = at(1, 2)) => runScoring({ model, budgetMs: 30_000, clock: () => when })
const leadAnswer = async (level = 3, note?: string) => {
  const prompt = (await releaseWeekOne(cycleId)).find((p) => p.evaluatorId === W.lead.id)!
  const responseId = await answerAs(prompt, level, at(1, 2), note)
  return { prompt, responseId }
}
const record = async (responseId: string) => (await loadAnswerRecords({ cycleId })).find((r) => r.responseId === responseId)
const queued = (state: string) => reviewQueue(HR_ACTOR, cycleId, state as never)

test('an answer is scored by the model from the chosen statement and the note, then waits for HR; the evaluator never sees a score', WEEKLY_DB_TEST, async () => {
  const { responseId } = await leadAnswer(3, 'Other teams adopted their handover checklist.')
  assert.equal((await record(responseId))?.state, 'SCORING')
  assert.deepEqual(await score(), { scored: 1, failed: 0, remaining: 0 })
  const answer = await record(responseId)
  assert.deepEqual([answer?.state, answer?.aiScore?.score], ['NEEDS_REVIEW', 3.5], 'the note moved it up half a level')
  assert.equal(answer?.score, null, 'nothing counts until HR confirms it')
  const item = (await queued('NEEDS_REVIEW')).items.find((i) => i.responseId === responseId)!
  assert.deepEqual([item.chosen.level, item.ai?.score, item.note], [3, 3.5, 'Other teams adopted their handover checklist.'])
  assert.ok(item.ai?.rationale)
  const inbox = JSON.stringify(await inboxView(W.lead.id, at(1, 2))) + JSON.stringify(await historyView(W.lead.id))
  assert.doesNotMatch(inbox, /"score"|"level"|rationale/)
})

test('HR confirms or changes every score; a change needs a reason; only confirmed scores count', WEEKLY_DB_TEST, async () => {
  const { responseId } = await leadAnswer(2)
  await score()
  const revision = (await record(responseId))!.revision
  await assert.rejects(decideAnswer(weeklyActor(W.lead), responseId, { action: 'ACCEPT', revision }, at(1, 3)), isStatus(403))
  await assert.rejects(decideAnswer(HR_ACTOR, responseId, { action: 'SET_SCORE', score: 2.5, revision }, at(1, 3)), isStatus(400, /reason/))
  await decideAnswer(HR_ACTOR, responseId, { action: 'SET_SCORE', score: 2.5, reason: 'Seen it myself', revision }, at(1, 3))
  const decided = await record(responseId)
  assert.deepEqual([decided?.state, decided?.score], ['DECIDED', 2.5])
  await assert.rejects(decideAnswer(HR_ACTOR, responseId, { action: 'ACCEPT', revision: revision - 1 }, at(1, 3)), isStatus(409), 'a decision on an older revision is refused')
})

test('changing an answer after HR decided scores it again and sends it back to HR', WEEKLY_DB_TEST, async () => {
  const { prompt, responseId } = await leadAnswer(2)
  await score()
  await decideAnswer(HR_ACTOR, responseId, { action: 'ACCEPT', revision: (await record(responseId))!.revision }, at(1, 3))
  await answerAs(prompt, 3, at(2))
  assert.deepEqual([(await record(responseId))?.state, (await record(responseId))?.score], ['SCORING', null])
  await score(fakeModel(), at(2, 1))
  assert.equal((await record(responseId))?.state, 'NEEDS_REVIEW')
})

test('the quarter closes only once HR has decided every answer, and the confirmed scores become the results', WEEKLY_DB_TEST, async () => {
  const { prompt, responseId } = await leadAnswer(3)
  assert.equal((await closeView(HR_ACTOR, cycleId, at(13))).blockers.scoring, 1)
  await assert.rejects(closeCycle(HR_ACTOR, cycleId, { drops: [] }, at(13)), isStatus(409, /HR has not decided|scored/))
  await score()
  assert.equal((await closeView(HR_ACTOR, cycleId, at(13))).blockers.needsReview, 1)
  await decideAnswer(HR_ACTOR, responseId, { action: 'SET_SCORE', score: 2, reason: 'Recalibrated', revision: (await record(responseId))!.revision }, at(1, 3))
  assert.equal((await closeView(HR_ACTOR, cycleId, at(13))).canClose, true)
  await closeCycle(HR_ACTOR, cycleId, { drops: [] }, at(13))
  const rows = await prisma.evaluation.findMany({ where: { periodId, source: 'AI_WEEKLY', evaluateeId: prompt.evaluateeId, ratingValue: { not: null } } })
  assert.deepEqual(rows.map((r) => r.ratingValue), [2])
})

test('a failed scoring is retried, then shown to HR, who can retry it or score it by hand', WEEKLY_DB_TEST, async () => {
  const { responseId } = await leadAnswer(2)
  const failing: StructuredModel = { name: 'failing', async complete() { throw new ModelError('PROVIDER_ERROR') } }
  for (let i = 0; i < 3; i += 1) await score(failing, new Date(at(1, 2).getTime() + i * 60 * 60 * 1000))
  assert.equal((await record(responseId))?.state, 'FAILED')
  assert.equal((await queued('FAILED')).items.length, 1)
  await retryScoring(HR_ACTOR, responseId, at(1, 3))
  assert.equal((await record(responseId))?.state, 'SCORING')
  await score(failing, at(1, 3))
  await decideAnswer(HR_ACTOR, responseId, { action: 'SET_SCORE', score: 2, reason: 'Scored by hand', revision: (await record(responseId))!.revision }, at(1, 4))
  assert.equal((await record(responseId))?.score, 2)
})

test('the 10% cap on 4s applies when HR confirms a score: over the limit needs a reason; a partner is exempt', WEEKLY_DB_TEST, async () => {
  const { responseId } = await leadAnswer(4, 'Their checklist is now used by the whole team.')
  await score()
  await decideAnswer(HR_ACTOR, responseId, { action: 'ACCEPT', revision: (await record(responseId))!.revision }, at(1, 3))
  await releaseWeek(cycleId, 2, at(2))
  const second = (await inboxView(W.lead.id, at(2))).prompts.find((p) => p.status === 'OPEN')!
  const secondId = await answerAs({ id: second.id, evaluatorId: W.lead.id }, 4, at(2), 'Also excellent.')
  await score(fakeModel(), at(2, 1))
  const item = (await queued('NEEDS_REVIEW')).items.find((i) => i.responseId === secondId)!
  assert.deepEqual([item.fours.used, item.fours.limit], [1, 1])
  const revision = (await record(secondId))!.revision
  await assert.rejects(decideAnswer(HR_ACTOR, secondId, { action: 'ACCEPT', revision }, at(2, 2)), isStatus(409, /limit/))
  await decideAnswer(HR_ACTOR, secondId, { action: 'ACCEPT', reason: 'Both earned it this quarter', revision }, at(2, 2))
  assert.equal((await record(secondId))?.score, 4)
})

test('names never reach the model', WEEKLY_DB_TEST, async () => {
  const requests: ModelRequest[] = []
  const spy: StructuredModel = { name: 'spy', async complete(request) { requests.push(request); return fakeModel().complete(request) } }
  const { prompt } = await leadAnswer(3, `${W.ana.name} and ${W.ben.name.split(' ')[0]} were great; ${W.lead.name} saw it.`)
  await score(spy)
  const sent = requests.map((r) => r.system + r.user).join('\n')
  const evaluatee = prompt.evaluateeId === W.ana.id ? W.ana : W.ben
  assert.doesNotMatch(sent, new RegExp(evaluatee.name.split(' ')[0]))
  assert.doesNotMatch(sent, new RegExp(W.lead.name.split(' ')[0]))
})

test('HR chooses the scoring model; without a key there is none', WEEKLY_DB_TEST, async () => {
  delete process.env.FIREWORKS_API_KEY
  assert.equal(await resolveActiveModel(), null)
  process.env.FIREWORKS_API_KEY = 'test-key'
  process.env.FIREWORKS_MODEL = 'accounts/fireworks/models/env-model'
  assert.equal((await resolveActiveModel())?.name, 'accounts/fireworks/models/env-model')
  await assert.rejects(setActiveModel(weeklyActor(W.ana), 'x', at(1)), isStatus(403))
  await setActiveModel(HR_ACTOR, 'accounts/fireworks/models/hr-choice', at(1))
  assert.equal((await resolveActiveModel())?.name, 'accounts/fireworks/models/hr-choice')
  const view = await aiSettingsView(HR_ACTOR)
  assert.deepEqual([view.activeModel, view.effectiveModel, view.apiKeyConfigured], ['accounts/fireworks/models/hr-choice', 'accounts/fireworks/models/hr-choice', true])
})

test('the round page shows how many answers wait for HR, and the preview tool scores waiting answers now', WEEKLY_DB_TEST, async () => {
  await prisma.evaluationPeriod.update({ where: { id: periodId }, data: { preEvaluationTriggeredAt: at(0) } })
  await leadAnswer(3)
  process.env.WEEKLY_TEST_TOOLS = 'true'
  process.env.WEEKLY_AI_FAKE = 'true'
  try {
    assert.deepEqual(await scoreNow(HR_ACTOR, cycleId, at(1, 2)), { scored: 1, failed: 0, remaining: 0 })
  } finally {
    delete process.env.WEEKLY_TEST_TOOLS
    delete process.env.WEEKLY_AI_FAKE
  }
  const item = (await roundView(HR_ACTOR, periodId, at(1, 2))).checklist.find((c) => c.key === 'review')!
  assert.deepEqual([item.count, item.done, item.tab], [1, false, 'review'])
  assert.match(item.label, /1 answer waiting for your review/)
})

test('confirming is bound to the model score HR saw: a newer score for the same answer is refused', WEEKLY_DB_TEST, async () => {
  const { responseId } = await leadAnswer(2)
  await score()
  const seen = (await record(responseId))!
  await prisma.weeklyAiScore.create({ data: { responseId, revision: seen.revision, model: 'other-model', promptVersion: 'mcq-1', score: 4, rationale: 'Later score', createdAt: at(1, 4) } })
  await assert.rejects(decideAnswer(HR_ACTOR, responseId, { action: 'ACCEPT', revision: seen.revision, aiScoreId: seen.aiScore!.id }, at(1, 5)), isStatus(409, /changed/))
})

test('with no model configured, answers wait instead of failing, and are scored once a model is there', WEEKLY_DB_TEST, async () => {
  const { responseId } = await leadAnswer(2)
  assert.equal((await runScoring({ model: null, budgetMs: 30_000, clock: () => at(1, 2) })).failed, 0)
  assert.equal((await record(responseId))?.state, 'SCORING')
  await score()
  assert.equal((await record(responseId))?.state, 'NEEDS_REVIEW')
})

test('saving the same choice and note again keeps HR’s decision', WEEKLY_DB_TEST, async () => {
  const { prompt, responseId } = await leadAnswer(2)
  await score()
  await decideAnswer(HR_ACTOR, responseId, { action: 'ACCEPT', revision: (await record(responseId))!.revision }, at(1, 3))
  await answerAs(prompt, 2, at(2))
  assert.deepEqual([(await record(responseId))?.state, (await record(responseId))?.score], ['DECIDED', 2])
})

test('an answer the model will not score (its round stopped) can still be scored by HR', WEEKLY_DB_TEST, async () => {
  const { responseId } = await leadAnswer(2)
  await prisma.weeklyScoringJob.updateMany({ where: { responseId }, data: { status: 'CANCELLED' } })
  assert.equal((await record(responseId))?.state, 'FAILED')
})

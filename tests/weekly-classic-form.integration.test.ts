import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { fakeModel } from '../lib/weekly/ai/model'
import { loadAnswerRecords } from '../lib/weekly/service/answer-states'
import { setClassicForm } from '../lib/weekly/service/classic-form'
import { closeCycle, closeView } from '../lib/weekly/service/close'
import { WeeklyError } from '../lib/weekly/service/errors'
import { weeklyCycleIdForPeriod } from '../lib/weekly/service/legacy'
import { runScoring } from '../lib/weekly/service/scoring'
import { answerAs, releaseWeekOne, scoringClock } from './helpers/weekly-answers'
import { acceptWaitingIn } from './helpers/weekly-close-fixtures'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const isError = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
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
  await prisma.$disconnect()
})

test('HR reopens the classic questionnaire for a running quarter and closes it again; each change is audited once', WEEKLY_DB_TEST, async () => {
  assert.equal(await weeklyCycleIdForPeriod(periodId), cycleId)
  await assert.rejects(setClassicForm(weeklyActor(W.lead), cycleId, true, at(3)), isError(403))
  assert.deepEqual(await setClassicForm(HR_ACTOR, cycleId, true, at(3)), { open: true })
  assert.equal(await weeklyCycleIdForPeriod(periodId), null)
  assert.deepEqual((await closeView(HR_ACTOR, cycleId, at(3))).classicForm, { open: true, openedAt: at(3).toISOString(), pairs: 0 })
  await setClassicForm(HR_ACTOR, cycleId, true, at(3, 2))
  await setClassicForm(HR_ACTOR, cycleId, false, at(4))
  assert.equal(await weeklyCycleIdForPeriod(periodId), cycleId)
  assert.deepEqual(
    [await prisma.weeklyAuditEvent.count({ where: { action: 'CLASSIC_FORM_OPEN' } }), await prisma.weeklyAuditEvent.count({ where: { action: 'CLASSIC_FORM_CLOSE' } })],
    [1, 1],
  )
})

test('at close a pair with classic answers keeps them, other pairs get weekly rows, and a classic draft under a weekly row is replaced', WEEKLY_DB_TEST, async () => {
  const prompts = new Map((await releaseWeekOne(cycleId)).map((p) => [p.evaluatorId, p]))
  const leadPrompt = prompts.get(W.lead.id)!
  const benPrompt = prompts.get(W.ben.id)!
  await answerAs(leadPrompt, 'strong')
  const benAnswer = await answerAs(benPrompt, 'solid')
  await runScoring({ model: fakeModel(), budgetMs: 30_000, clock: () => scoringClock() })
  await acceptWaitingIn(cycleId, at(1, 3))
  await setClassicForm(HR_ACTOR, cycleId, true, at(2))
  const classicQuestion = await prisma.evaluationQuestion.findFirstOrThrow({ where: { relationshipType: 'DIRECT_REPORT', questionType: 'RATING', orderIndex: { gte: 900 } }, orderBy: { orderIndex: 'asc' } })
  const classic = await prisma.evaluation.create({
    data: { evaluatorId: W.lead.id, evaluateeId: leadPrompt.evaluateeId, periodId, questionId: classicQuestion.id, ratingValue: 3, submittedAt: at(2, 2) },
  })
  const [benRecord] = await loadAnswerRecords({ responseIds: [benAnswer] })
  const benTopic = await prisma.weeklyCompetency.findUniqueOrThrow({ where: { id: benRecord.competencyId! } })
  await prisma.evaluation.create({ data: { evaluatorId: W.ben.id, evaluateeId: benPrompt.evaluateeId, periodId, questionId: benTopic.sourceQuestionId, ratingValue: 1, submittedAt: null } })
  assert.equal((await closeView(HR_ACTOR, cycleId, at(13))).classicForm.pairs, 1)

  const result = await closeCycle(HR_ACTOR, cycleId, { drops: [] }, at(13))
  assert.deepEqual([result.counts.skippedManualPairs, result.counts.clearedClassicDrafts, result.counts.ratingRows], [1, 1, 1])
  const leadRows = await prisma.evaluation.findMany({ where: { periodId, evaluatorId: W.lead.id, evaluateeId: leadPrompt.evaluateeId } })
  assert.deepEqual(leadRows.map((r) => [r.id, r.source, r.ratingValue]), [[classic.id, 'MANUAL', 3]])
  const benRows = await prisma.evaluation.findMany({ where: { periodId, evaluatorId: W.ben.id, evaluateeId: benPrompt.evaluateeId } })
  assert.deepEqual(benRows.map((r) => [r.questionId, r.source, r.ratingValue]), [[benTopic.sourceQuestionId, 'AI_WEEKLY', 2]])
  assert.equal((await prisma.weeklyCycle.findUniqueOrThrow({ where: { id: cycleId } })).classicFormOpen, false)
  await assert.rejects(setClassicForm(HR_ACTOR, cycleId, true, at(13, 2)), isError(409))
})

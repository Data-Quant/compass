import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { computePeriodScoreMatrix } from '../lib/analytics/period-score-matrix'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/db'
import { getResolvedEvaluationAssignments } from '../lib/evaluation-assignments'
import { calculateWeightedScore } from '../lib/scoring'
import { closeCycle, closeView, publishResults, reopenCycle } from '../lib/weekly/service/close'
import { WeeklyError } from '../lib/weekly/service/errors'
import { submitForm } from '../lib/weekly/service/form-submit'
import { formDetail, openForms } from '../lib/weekly/service/forms'
import { submitAnswer } from '../lib/weekly/service/inbox'
import { releaseWeek } from '../lib/weekly/service/release'
import { answerAs, releaseWeekOne } from './helpers/weekly-answers'
import { leadEvidenceIn } from './helpers/weekly-close-fixtures'
import { F, seedFormFixtures } from './helpers/weekly-form-fixtures'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const isError = (status: number, pattern?: RegExp) => (e: unknown) => e instanceof WeeklyError && e.status === status && (!pattern || pattern.test(e.message))
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
  delete process.env.WEEKLY_TEST_TOOLS
  await prisma.$disconnect()
})

const leadEvidence = () => leadEvidenceIn(cycleId)
const weeklyRows = (evaluateeId?: string) => prisma.evaluation.findMany({ where: { periodId, source: 'AI_WEEKLY', ...(evaluateeId ? { evaluateeId } : {}) }, orderBy: { createdAt: 'asc' } })

test('answers are scored as they are given, so the quarter can close at once; a locked period cannot', WEEKLY_DB_TEST, async () => {
  const prompt = (await releaseWeekOne(cycleId)).find((p) => p.evaluatorId === W.lead.id)!
  await answerAs(prompt, 3)
  assert.equal((await closeView(HR_ACTOR, cycleId, at(13))).canClose, true)
  await prisma.evaluationPeriod.update({ where: { id: periodId }, data: { isLocked: true } })
  assert.equal((await closeView(HR_ACTOR, cycleId, at(13))).canClose, false)
  await assert.rejects(closeCycle(HR_ACTOR, cycleId, { drops: [] }, at(13)), isError(409, /Unlock/))
  await assert.rejects(closeView(weeklyActor(W.lead), cycleId, at(13)), isError(403))
})

test('closing turns the chosen scores and comments into weekly rows, expires open questions and records the run', WEEKLY_DB_TEST, async () => {
  const { evaluateeId } = await leadEvidence()
  await releaseWeek(cycleId, 12, at(12))
  const comment = await prisma.weeklyPrompt.findFirstOrThrow({ where: { cycleId, kind: 'COMMENT', evaluatorId: W.lead.id, evaluateeId } })
  await submitAnswer(weeklyActor(W.lead), { evaluatorId: W.lead.id, actingAs: false }, comment.id, { commentText: 'Keep sharing plans early.' }, at(12, 2))
  const result = await closeCycle(HR_ACTOR, cycleId, { drops: [] }, at(13))
  assert.deepEqual([result.counts.ratingRows, result.counts.commentRows], [1, 1])
  const rows = await weeklyRows(evaluateeId)
  const rating = rows.find((r) => r.ratingValue !== null)!
  const competency = await prisma.weeklyCompetency.findFirstOrThrow({ where: { slots: { some: { evaluatorId: W.lead.id, evaluateeId, status: 'SATISFIED' } } } })
  assert.deepEqual([rating.questionId, rating.ratingValue, rating.aggregationRunId, rating.submittedAt?.getTime()], [competency.sourceQuestionId, 4, result.runId, at(13).getTime()])
  assert.deepEqual(rows.filter((r) => r.textResponse).map((r) => [r.questionId, r.textResponse]), [[comment.questionId, 'Keep sharing plans early.']])
  const cycle = await prisma.weeklyCycle.findUniqueOrThrow({ where: { id: cycleId } })
  assert.deepEqual([cycle.status, cycle.closedAt?.getTime()], ['CLOSED', at(13).getTime()])
  assert.equal(await prisma.weeklyPrompt.count({ where: { cycleId, status: { in: ['OPEN', 'DRAFT'] } } }), 0)
  assert.ok((await calculateWeightedScore(evaluateeId, periodId)).overallScore > 0)
  await assert.rejects(closeCycle(HR_ACTOR, cycleId, { drops: [] }, at(13, 2)), isError(409, /already closed/))
})

test('dropping a group removes all its assignments, cross-department ones too, so its weight moves', WEEKLY_DB_TEST, async () => {
  const { evaluateeId } = await leadEvidence()
  await prisma.evaluationPeriodAssignmentOverride.create({ data: { periodId, evaluatorId: W.cara.id, evaluateeId, relationshipType: 'CROSS_DEPARTMENT', action: 'ADD' } })
  const view = await closeView(HR_ACTOR, cycleId, at(13))
  const peer = view.dropCandidates.find((c) => c.evaluatee.id === evaluateeId && c.perspective === 'PEER')!
  assert.equal(peer.assignments, 2)
  assert.ok(!view.dropCandidates.some((c) => c.evaluatee.id === evaluateeId && c.perspective === 'LEAD'))
  const result = await closeCycle(HR_ACTOR, cycleId, { drops: [{ evaluateeId, perspective: 'PEER' }] }, at(13))
  assert.deepEqual(result.drops, [{ evaluateeId, perspective: 'PEER', overrides: 2 }])
  const remaining = await getResolvedEvaluationAssignments(periodId, { evaluateeId })
  assert.deepEqual(remaining.map((a) => a.relationshipType), ['TEAM_LEAD'])
  // The only category left is the lead's, scored 4: its weight is now the whole score.
  assert.equal((await calculateWeightedScore(evaluateeId, periodId)).overallScore, 100)
  await assert.rejects(closeCycle(HR_ACTOR, cycleId, { drops: [] }, at(13)), isError(409))
})

test('two closes at the same moment make one run', WEEKLY_DB_TEST, async () => {
  await leadEvidence()
  const results = await Promise.allSettled([closeCycle(HR_ACTOR, cycleId, { drops: [] }, at(13)), closeCycle(HR_ACTOR, cycleId, { drops: [] }, at(13))])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  const loser = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  assert.ok(isError(409, /already closed/)(loser?.reason), String(loser?.reason))
  assert.equal(await prisma.weeklyAggregationRun.count({ where: { cycleId } }), 1)
})

test('reopening and closing again replaces the weekly rows and leaves the form rows alone', WEEKLY_DB_TEST, async () => {
  await seedFormFixtures(prisma)
  const { evaluateeId, responseId } = await leadEvidence()
  await openForms(HR_ACTOR, cycleId, at(12))
  const chief = weeklyActor(F.chief)
  const questions = (await formDetail(chief, { relationshipType: 'C_LEVEL', evaluateeId }, at(12))).questions
  await submitForm(chief, {
    relationshipType: 'C_LEVEL', evaluateeId,
    responses: questions.map((q) => ({ questionId: q.id, questionSource: q.source, ratingValue: q.type === 'RATING' ? 3 : null, textResponse: q.type === 'TEXT' ? 'Good quarter.' : null })),
  }, at(12))
  const formRows = () => prisma.evaluation.findMany({ where: { periodId, source: 'MANUAL' }, select: { id: true, ratingValue: true, submittedAt: true }, orderBy: { id: 'asc' } })
  const formsBefore = await formRows()
  // The chief's other forms and Ana's HR form are still unsubmitted: HR closes anyway.
  await closeCycle(HR_ACTOR, cycleId, { drops: [], formsAcknowledged: true }, at(13))
  await reopenCycle(HR_ACTOR, cycleId, at(13, 2))
  // Reopened and not locked: the lead changes their answer.
  const answered = await prisma.weeklyResponse.findUniqueOrThrow({ where: { id: responseId }, include: { prompt: true } })
  await answerAs(answered.prompt, 2, at(13, 2))
  await closeCycle(HR_ACTOR, cycleId, { drops: [], formsAcknowledged: true }, at(13, 3))
  const ratings = (await weeklyRows(evaluateeId)).filter((r) => r.ratingValue !== null)
  assert.deepEqual(ratings.map((r) => r.ratingValue), [2])
  assert.deepEqual(await formRows(), formsBefore)
  assert.equal(await prisma.weeklyAggregationRun.count({ where: { cycleId } }), 2)
  await publishResults(HR_ACTOR, cycleId, at(13, 4))
  await assert.rejects(reopenCycle(HR_ACTOR, cycleId, at(13, 5)), isError(409, /released/))
})

test('people who left before close get no weekly rows', WEEKLY_DB_TEST, async () => {
  const { evaluateeId } = await leadEvidence()
  await prisma.payrollEmployeeProfile.create({ data: { userId: evaluateeId, isPayrollActive: false, exitDate: at(12) } })
  const result = await closeCycle(HR_ACTOR, cycleId, { drops: [] }, at(13))
  assert.equal(result.counts.excludedEvaluatees, 1)
  assert.equal((await weeklyRows(evaluateeId)).length, 0)
})

test('after aggregation the analytics matrix and the scorer agree (as scripts/verify-analytics-scores.ts checks)', WEEKLY_DB_TEST, async () => {
  const { evaluateeId } = await leadEvidence()
  await closeCycle(HR_ACTOR, cycleId, { drops: [] }, at(13))
  const matrix = await computePeriodScoreMatrix(periodId)
  assert.ok(matrix && matrix.scores.some((s) => s.employeeId === evaluateeId))
  for (const entry of matrix!.scores) {
    const expected = (await calculateWeightedScore(entry.employeeId, periodId)).overallScore
    assert.ok(Math.abs(entry.overallScore - expected) < 1e-9, `${entry.employeeId}: ${entry.overallScore} vs ${expected}`)
  }
})

test('several answers about one person on one topic are averaged into one row', WEEKLY_DB_TEST, async () => {
  const prompt = (await releaseWeekOne(cycleId)).find((p) => p.evaluatorId === W.lead.id)!
  await answerAs(prompt, 3)
  const again = await prisma.weeklyPrompt.create({
    data: { cycleId, slotId: prompt.slotId, evaluatorId: W.lead.id, evaluateeId: prompt.evaluateeId, relationshipType: prompt.relationshipType, weekIndex: 4, textSnapshot: prompt.textSnapshot, options: prompt.options ?? undefined, releasedAt: at(4) },
  })
  await answerAs(again, 2, at(4))
  await closeCycle(HR_ACTOR, cycleId, { drops: [] }, at(13))
  assert.deepEqual((await weeklyRows(prompt.evaluateeId)).map((r) => r.ratingValue), [2.5])
})

test('closing while end-of-quarter forms are unsubmitted names who has them and needs HR to confirm', WEEKLY_DB_TEST, async () => {
  await seedFormFixtures(prisma)
  await leadEvidence()
  const view = await closeView(HR_ACTOR, cycleId, at(13))
  assert.deepEqual(view.forms.outstanding, [F.chief.name, W.hr.name, F.hr2.name])
  await assert.rejects(closeCycle(HR_ACTOR, cycleId, { drops: [] }, at(13)), isError(409, /not submitted yet \(Cyrus Vale, Hana Reyes, Hugo Brandt\)/))
  assert.equal((await prisma.weeklyCycle.findUniqueOrThrow({ where: { id: cycleId } })).status, 'RUNNING')
  const result = await closeCycle(HR_ACTOR, cycleId, { drops: [], formsAcknowledged: true }, at(13))
  assert.equal(result.counts.ratingRows, 1)
})

test('a quarter answered under the earlier free-text model cannot be reopened, so its results are never rebuilt without those answers', WEEKLY_DB_TEST, async () => {
  const prompt = (await releaseWeekOne(cycleId)).find((p) => p.evaluatorId === W.lead.id)!
  await prisma.weeklyPrompt.update({ where: { id: prompt.id }, data: { options: Prisma.DbNull, status: 'EXPIRED' } })
  await closeCycle(HR_ACTOR, cycleId, { drops: [] }, at(13))
  await assert.rejects(reopenCycle(HR_ACTOR, cycleId, at(13, 2)), isError(409, /earlier free-text/))
})

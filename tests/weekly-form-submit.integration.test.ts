import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import type { FormInput } from '../lib/weekly/schemas'
import { WeeklyError } from '../lib/weekly/service/errors'
import { HR_SLOT_CLOSED, saveFormDraft, submitForm } from '../lib/weekly/service/form-submit'
import { formDetail, formsView } from '../lib/weekly/service/forms'
import type { FormQuestionView } from '../lib/weekly/view-types'
import { F, seedFormFixtures } from './helpers/weekly-form-fixtures'
import { at, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const NOW = at(12, 2)
const chief = weeklyActor(F.chief)
const isError = (status: number, pattern?: RegExp) => (e: unknown) => e instanceof WeeklyError && e.status === status && (!pattern || pattern.test(e.message))
let periodId = ''
before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  ;({ periodId } = await seedWeeklyBase(prisma))
  await seedFormFixtures(prisma)
  await startedCycle(periodId)
})
after(async () => {
  await prisma.$disconnect()
})

const questionsFor = async (actor: ReturnType<typeof weeklyActor>, relationshipType: FormInput['relationshipType'], evaluateeId: string) =>
  (await formDetail(actor, { relationshipType, evaluateeId }, NOW)).questions
/** Ratings in question order; explanations by question index; comment questions get a comment. */
function responses(questions: FormQuestionView[], ratings: number[], explanations: Record<number, string> = {}): FormInput['responses'] {
  return questions.map((q, i) =>
    q.type === 'RATING'
      ? { questionId: q.id, questionSource: q.source, ratingValue: ratings[i], textResponse: explanations[i] ?? null }
      : { questionId: q.id, questionSource: q.source, textResponse: 'Thank you for a strong quarter.' },
  )
}

test('submitting needs every rating, and 1s and 4s need an explanation', WEEKLY_DB_TEST, async () => {
  const questions = await questionsFor(chief, 'C_LEVEL', W.ana.id)
  const form = (r: FormInput['responses']): FormInput => ({ relationshipType: 'C_LEVEL', evaluateeId: W.ana.id, responses: r })
  await assert.rejects(submitForm(chief, form(responses(questions, [3, 3]).slice(0, 2)), NOW), isError(400, /A rating is required for "Client impact"/))
  await assert.rejects(submitForm(chief, form(responses(questions, [4, 3, 3])), NOW), isError(400, /Explanation is required/))
  await submitForm(chief, form(responses(questions, [4, 3, 3], { 0: 'Led the client renewal end to end.' })), NOW)
  const rows = await prisma.evaluation.findMany({ where: { periodId, evaluatorId: F.chief.id, evaluateeId: W.ana.id }, include: { question: true }, orderBy: { question: { orderIndex: 'asc' } } })
  assert.deepEqual(rows.map((r) => [r.ratingValue, r.source, r.submittedAt !== null]), [[4, 'MANUAL', true], [3, 'MANUAL', true], [3, 'MANUAL', true], [null, 'MANUAL', true]])
  assert.equal((await formDetail(chief, { relationshipType: 'C_LEVEL', evaluateeId: W.ana.id }, NOW)).status, 'SUBMITTED')
  await assert.rejects(saveFormDraft(chief, form(responses(questions, [2, 2, 2])), NOW), isError(409))
})

test('4s are capped at 10% of the evaluator’s questions of that kind', WEEKLY_DB_TEST, async () => {
  const explain = { 0: 'Exceptional year.' }
  await submitForm(chief, { relationshipType: 'C_LEVEL', evaluateeId: W.ana.id, responses: responses(await questionsFor(chief, 'C_LEVEL', W.ana.id), [4, 3, 3], explain) }, NOW)
  // The chief also holds a Department form for Ana: her C-Level 4 must still count against the C-Level allowance.
  assert.deepEqual((await formDetail(chief, { relationshipType: 'C_LEVEL', evaluateeId: W.ben.id }, NOW)).fourRatings, { max: 1, used: 1 })
  assert.deepEqual((await formDetail(chief, { relationshipType: 'DEPT', evaluateeId: W.ana.id }, NOW)).fourRatings, { max: 1, used: 0 })
  const ben ={ relationshipType: 'C_LEVEL' as const, evaluateeId: W.ben.id, responses: responses(await questionsFor(chief, 'C_LEVEL', W.ben.id), [4, 3, 3], explain) }
  await assert.rejects(submitForm(chief, ben, NOW), isError(400, /capped at 1/))
})

test('the department form is written once for every member of the department', WEEKLY_DB_TEST, async () => {
  const questions = await questionsFor(chief, 'DEPT', W.ana.id)
  await submitForm(chief, { relationshipType: 'DEPT', evaluateeId: W.ana.id, responses: responses(questions, [3, 2]) }, NOW)
  const rows = await prisma.evaluation.findMany({ where: { periodId, evaluatorId: F.chief.id, question: { relationshipType: 'DEPT' } } })
  assert.deepEqual(rows.map((r) => r.evaluateeId).sort(), [W.ana.id, W.ana.id, W.ben.id, W.ben.id].sort())
  assert.equal((await formsView(chief, NOW)).forms.find((f) => f.relationshipType === 'DEPT')?.status, 'SUBMITTED')
})

test('the first HR submission counts, even when two HR evaluators submit at the same moment', WEEKLY_DB_TEST, async () => {
  const hr = weeklyActor(W.hr)
  const hr2 = weeklyActor(F.hr2)
  const input: FormInput = { relationshipType: 'HR', evaluateeId: W.ana.id, responses: responses(await questionsFor(hr, 'HR', W.ana.id), [3, 2]) }
  const results = await Promise.allSettled([submitForm(hr, input, NOW), submitForm(hr2, input, NOW)])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  const loserIndex = results.findIndex((r) => r.status === 'rejected')
  assert.ok(isError(409, new RegExp(HR_SLOT_CLOSED.slice(0, 20)))((results[loserIndex] as PromiseRejectedResult).reason))
  const loser = loserIndex === 0 ? hr : hr2
  assert.equal((await formsView(loser, NOW)).forms[0].status, 'CLOSED_BY_OTHER')
})

test('a draft keeps partial answers for later', WEEKLY_DB_TEST, async () => {
  const [first] = await questionsFor(chief, 'C_LEVEL', W.ana.id)
  await saveFormDraft(chief, { relationshipType: 'C_LEVEL', evaluateeId: W.ana.id, responses: [{ questionId: first.id, questionSource: first.source, ratingValue: 2 }] }, NOW)
  const detail = await formDetail(chief, { relationshipType: 'C_LEVEL', evaluateeId: W.ana.id }, NOW)
  assert.deepEqual([detail.status, detail.questions[0].ratingValue], ['DRAFT', 2])
  const row = await prisma.evaluation.findFirstOrThrow({ where: { periodId, evaluatorId: F.chief.id, questionId: first.id } })
  assert.equal(row.submittedAt, null)
})

test('forms refuse answers before they open and once the period is locked', WEEKLY_DB_TEST, async () => {
  const questions = await questionsFor(chief, 'C_LEVEL', W.ana.id)
  const input: FormInput = { relationshipType: 'C_LEVEL', evaluateeId: W.ana.id, responses: responses(questions, [3, 3, 3]) }
  await assert.rejects(submitForm(chief, input, at(3)), isError(409, /open on/))
  await prisma.evaluationPeriod.update({ where: { id: periodId }, data: { isLocked: true } })
  await assert.rejects(submitForm(chief, input, NOW), isError(409, /locked/))
})

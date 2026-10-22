import test, { after, afterEach, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { WeeklyError } from '../lib/weekly/service/errors'
import { earlierQuarterView } from '../lib/weekly/service/earlier-quarter'
import { lateFormDetail, lateFormsView, saveLateFormDraft, setLateForms, submitLateForm } from '../lib/weekly/service/late-forms'
import { setRoundLock } from '../lib/weekly/service/round'
import type { LateFormDetailResponse } from '../lib/weekly/view-types'
import { F, seedFormFixtures } from './helpers/weekly-form-fixtures'
import { HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
const NOW = new Date('2026-10-22T06:00:00Z')
const EARLIER = 'Earlier quarter (late forms test)'
const ana = weeklyActor(W.ana)
let earlierId = ''
let runningPeriodId = ''

before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  await prisma.evaluationPeriod.deleteMany({ where: { name: EARLIER } })
  ;({ periodId: runningPeriodId } = await seedWeeklyBase(prisma))
  await seedFormFixtures(prisma)
  await startedCycle(runningPeriodId)
  // A quarter run on the earlier evaluations (no weekly round), with everyone's mappings.
  const earlier = await prisma.evaluationPeriod.create({
    data: { name: EARLIER, startDate: new Date('2026-07-01T00:00:00Z'), endDate: new Date('2026-09-30T00:00:00Z'), reviewStartDate: new Date('2026-10-05T00:00:00Z'), isActive: false },
  })
  earlierId = earlier.id
  process.env.WEEKLY_HR_FILLED_PARTNERS = F.chief.name
})
afterEach(() => {
  delete process.env.WEEKLY_HR_FILLED_PARTNERS
})
after(async () => {
  await prisma.$disconnect()
})

const peerForm = { relationshipType: 'PEER' as const, evaluateeId: W.ben.id }
/** Every question answered: `ratings` in order for the rating questions, a note on each. */
const answers = (detail: LateFormDetailResponse, ratings: number[]) => {
  let next = 0
  return detail.questions.map((q) => ({
    questionId: q.id, questionSource: q.source,
    ratingValue: q.type === 'RATING' ? ratings[next++ % ratings.length] : null,
    textResponse: 'Worked closely with them all quarter.',
  }))
}

test('nothing shows until HR lets employees finish the quarter; then each person sees what they owe it, HR forms and partners aside', WEEKLY_DB_TEST, async () => {
  assert.equal((await lateFormsView(ana, NOW)).quarter, null)
  await setLateForms(HR_ACTOR, earlierId, true, NOW)

  const view = await lateFormsView(ana, NOW)
  assert.equal(view.quarter?.periodId, earlierId)
  assert.deepEqual(view.forms.map((f) => [f.relationshipType, f.evaluatee.id, f.status]), [['DIRECT_REPORT', W.lead.id, 'NOT_STARTED'], ['PEER', W.ben.id, 'NOT_STARTED']])
  assert.deepEqual((await lateFormsView(weeklyActor(W.lead), NOW)).forms.map((f) => [f.relationshipType, f.evaluatee.id]), [['TEAM_LEAD', W.ana.id], ['TEAM_LEAD', W.ben.id]])
  // HR's own HR forms stay in HR's tables; a partner's evaluations are HR's to fill in.
  assert.deepEqual((await lateFormsView(HR_ACTOR, NOW)).forms, [])
  assert.deepEqual((await lateFormsView(weeklyActor(F.chief), NOW)).forms, [])

  const progress = (await earlierQuarterView(HR_ACTOR, earlierId, NOW)).lateForms
  assert.equal(progress.openedAt, NOW.toISOString())
  assert.equal(progress.people.find((p) => p.id === W.ana.id)?.left, 2)
})

test('a late form saves as a draft, submits into the earlier quarter, and then leaves the list', WEEKLY_DB_TEST, async () => {
  await setLateForms(HR_ACTOR, earlierId, true, NOW)
  const detail = await lateFormDetail(ana, { periodId: earlierId, ...peerForm }, NOW)
  assert.equal(detail.status, 'NOT_STARTED')
  assert.ok(detail.questions.some((q) => q.type === 'RATING'))

  await saveLateFormDraft(ana, { periodId: earlierId, ...peerForm, responses: answers(detail, [3]) }, NOW)
  assert.equal((await lateFormsView(ana, NOW)).forms.find((f) => f.evaluatee.id === W.ben.id)?.status, 'DRAFT')
  await assert.rejects(submitLateForm(ana, { periodId: earlierId, ...peerForm, responses: answers(detail, [3]).map((r) => ({ ...r, ratingValue: null })) }, NOW), /rating is required/)

  await submitLateForm(ana, { periodId: earlierId, ...peerForm, responses: answers(detail, [3]) }, NOW)
  const saved = await prisma.evaluation.findMany({ where: { evaluatorId: W.ana.id, evaluateeId: W.ben.id } })
  assert.ok(saved.length > 0 && saved.every((e) => e.periodId === earlierId && e.submittedAt), 'written to the earlier quarter, submitted')
  const view = await lateFormsView(ana, NOW)
  assert.deepEqual([view.total, view.forms.map((f) => f.evaluatee.id)], [2, [W.lead.id]])
  await assert.rejects(saveLateFormDraft(ana, { periodId: earlierId, ...peerForm, responses: answers(detail, [2]) }, NOW), isStatus(409))
})

test('the quarter’s 10% cap on 4s still applies', WEEKLY_DB_TEST, async () => {
  await setLateForms(HR_ACTOR, earlierId, true, NOW)
  const detail = await lateFormDetail(ana, { periodId: earlierId, ...peerForm }, NOW)
  assert.ok(detail.fourRatings, 'Ana is not exempt')
  await assert.rejects(submitLateForm(ana, { periodId: earlierId, ...peerForm, responses: answers(detail, [4]) }, NOW), /capped/)
})

test('closing the quarter or stopping ends it; only HR opens it, one earlier quarter at a time, never a weekly round', WEEKLY_DB_TEST, async () => {
  await assert.rejects(setLateForms(ana, earlierId, true, NOW), isStatus(403))
  await assert.rejects(setLateForms(HR_ACTOR, runningPeriodId, true, NOW), isStatus(409))
  await setLateForms(HR_ACTOR, earlierId, true, NOW)
  const older = await prisma.evaluationPeriod.create({
    data: { name: EARLIER, startDate: new Date('2026-04-01T00:00:00Z'), endDate: new Date('2026-06-30T00:00:00Z'), reviewStartDate: new Date('2026-07-05T00:00:00Z'), isActive: false },
  })
  await assert.rejects(setLateForms(HR_ACTOR, older.id, true, NOW), /Stop that first/)
  const detail = await lateFormDetail(ana, { periodId: earlierId, ...peerForm }, NOW)

  await setRoundLock(HR_ACTOR, earlierId, true)
  assert.equal((await lateFormsView(ana, NOW)).quarter, null)
  await assert.rejects(submitLateForm(ana, { periodId: earlierId, ...peerForm, responses: answers(detail, [3]) }, NOW), /closed/)
  // Reopening the quarter to correct something does not reopen it to employees: HR has to say so again.
  await setRoundLock(HR_ACTOR, earlierId, false)
  assert.equal((await lateFormsView(ana, NOW)).quarter, null)
  assert.equal((await earlierQuarterView(HR_ACTOR, earlierId, NOW)).lateForms.openedAt, null)

  await setLateForms(HR_ACTOR, earlierId, true, NOW)
  assert.equal((await lateFormsView(ana, NOW)).quarter?.periodId, earlierId)
  await setLateForms(HR_ACTOR, earlierId, false, NOW)
  assert.equal((await lateFormsView(ana, NOW)).quarter, null)
  await assert.rejects(lateFormDetail(ana, { periodId: earlierId, ...peerForm }, NOW), /closed/)
})

test('a submitted evaluation is never overwritten, including one submitted under the earlier evaluations on questions since changed', WEEKLY_DB_TEST, async () => {
  await setLateForms(HR_ACTOR, earlierId, true, NOW)
  const detail = await lateFormDetail(ana, { periodId: earlierId, ...peerForm }, NOW)
  await submitLateForm(ana, { periodId: earlierId, ...peerForm, responses: answers(detail, [3]) }, NOW)
  await assert.rejects(submitLateForm(ana, { periodId: earlierId, ...peerForm, responses: answers(detail, [2]) }, NOW), /already submitted/)
  assert.ok((await prisma.evaluation.findMany({ where: { evaluatorId: W.ana.id, evaluateeId: W.ben.id, ratingValue: { not: null } } })).every((e) => e.ratingValue === 3))
  assert.equal((await lateFormDetail(ana, { periodId: earlierId, ...peerForm }, NOW)).status, 'SUBMITTED')

  // Ana's evaluation of her lead was submitted on a question no longer in that bank: it still counts as done.
  const retired = await prisma.evaluationQuestion.findFirstOrThrow({ where: { relationshipType: 'C_LEVEL', orderIndex: { gte: 950 } } })
  await prisma.evaluation.create({ data: { periodId: earlierId, evaluatorId: W.ana.id, evaluateeId: W.lead.id, questionId: retired.id, ratingValue: 3, submittedAt: NOW } })
  assert.deepEqual((await lateFormsView(ana, NOW)).forms, [])
})

test('someone who joined after the quarter owes none of it, and nobody opens a form that is not theirs', WEEKLY_DB_TEST, async () => {
  await setLateForms(HR_ACTOR, earlierId, true, NOW)
  await prisma.payrollEmployeeProfile.create({ data: { userId: W.ana.id, joiningDate: new Date('2026-10-05T00:00:00Z') } })
  assert.deepEqual((await lateFormsView(ana, NOW)).forms, [])
  await assert.rejects(lateFormDetail(ana, { periodId: earlierId, ...peerForm }, NOW), isStatus(404))
  await assert.rejects(lateFormDetail(weeklyActor(W.cara), { periodId: earlierId, ...peerForm }, NOW), isStatus(404))
})

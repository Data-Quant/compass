import test, { after, afterEach, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { WeeklyError } from '../lib/weekly/service/errors'
import { earlierQuarterView } from '../lib/weekly/service/earlier-quarter'
import { formTables, saveTableRow } from '../lib/weekly/service/form-tables'
import { roundResults } from '../lib/weekly/service/round-results'
import { roundsList, setRoundLock } from '../lib/weekly/service/round'
import { F, seedFormFixtures } from './helpers/weekly-form-fixtures'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
let earlierId = ''
let runningPeriodId = ''

before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  ;({ periodId: runningPeriodId } = await seedWeeklyBase(prisma))
  await seedFormFixtures(prisma)
  await startedCycle(runningPeriodId)
  // A quarter run on the earlier evaluations: no weekly round.
  const earlier = await prisma.evaluationPeriod.create({
    data: { name: 'Earlier quarter', startDate: new Date('2026-04-01T00:00:00Z'), endDate: new Date('2026-06-30T00:00:00Z'), reviewStartDate: new Date('2026-07-05T00:00:00Z'), isActive: false },
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

const cLevelIds = async () =>
  (await prisma.evaluationQuestion.findMany({ where: { relationshipType: 'C_LEVEL', questionType: 'RATING', orderIndex: { gte: 950 } }, orderBy: { orderIndex: 'asc' } })).map((q) => q.id)

test('an earlier quarter is listed with the rounds, and HR fills a partner’s missing scores in its own tables', WEEKLY_DB_TEST, async () => {
  const questions = await cLevelIds()
  // Ben's C-suite evaluation was already submitted under the earlier evaluations.
  await prisma.evaluation.createMany({ data: questions.map((questionId) => ({ periodId: earlierId, evaluatorId: F.chief.id, evaluateeId: W.ben.id, questionId, ratingValue: 3, submittedAt: at(1) })) })

  const listed = (await roundsList(HR_ACTOR)).find((r) => r.periodId === earlierId)
  assert.ok(listed?.earlier, 'listed as an earlier quarter')

  const view = await formTables(HR_ACTOR, 'PARTNER', at(1), earlierId)
  assert.equal(view.open, true)
  assert.equal(view.quarter?.periodId, earlierId)
  const cLevel = view.tables.find((t) => t.relationshipType === 'C_LEVEL')!
  assert.deepEqual(cLevel.rows.map((r) => [r.evaluateeId, r.status]), [[W.ana.id, 'NOT_STARTED'], [W.ben.id, 'SUBMITTED']])

  await saveTableRow(HR_ACTOR, { kind: 'PARTNER', evaluatorId: F.chief.id, relationshipType: 'C_LEVEL', evaluateeId: W.ana.id, ratings: questions.map((questionId) => ({ questionId, ratingValue: 3 })), submit: true, periodId: earlierId }, at(1))
  const saved = await prisma.evaluation.findMany({ where: { evaluateeId: W.ana.id, questionId: { in: questions } } })
  assert.ok(saved.length === questions.length && saved.every((e) => e.periodId === earlierId && e.submittedAt), 'written to the earlier quarter')
  const progress = await earlierQuarterView(HR_ACTOR, earlierId)
  assert.ok(progress.forms.done >= 2)
  await assert.rejects(formTables(weeklyActor(W.ana), 'PARTNER', at(1), earlierId), isStatus(403))
})

test('closing an earlier quarter locks it for good scores and readies its reports; it can be reopened', WEEKLY_DB_TEST, async () => {
  const questions = await cLevelIds()
  assert.equal((await roundResults(HR_ACTOR, earlierId)).closed, false)
  await setRoundLock(HR_ACTOR, earlierId, true)
  assert.equal((await earlierQuarterView(HR_ACTOR, earlierId)).locked, true)
  assert.equal((await roundResults(HR_ACTOR, earlierId)).closed, true)
  await assert.rejects(
    saveTableRow(HR_ACTOR, { kind: 'PARTNER', evaluatorId: F.chief.id, relationshipType: 'C_LEVEL', evaluateeId: W.ana.id, ratings: questions.map((questionId) => ({ questionId, ratingValue: 2 })), submit: true, periodId: earlierId }, at(1)),
    /locked/,
  )
  await setRoundLock(HR_ACTOR, earlierId, false)
  assert.equal((await earlierQuarterView(HR_ACTOR, earlierId)).locked, false)
  await assert.rejects(setRoundLock(weeklyActor(W.ana), earlierId, true), isStatus(403))
})

import test, { after, afterEach, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { getResolvedEvaluationQuestions } from '../lib/pre-evaluation'
import { formTables } from '../lib/weekly/service/form-tables'
import { lateFormDetail, setLateForms } from '../lib/weekly/service/late-forms'
import { F, seedFormFixtures } from './helpers/weekly-form-fixtures'
import { HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const NOW = new Date('2026-10-22T06:00:00Z')
const EARLIER = 'Earlier quarter (pinned questions test)'
let earlierId = ''
let runningPeriodId = ''

before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  // Every test suite's earlier quarters go: one left open to employees would block opening this one.
  await prisma.evaluationPeriod.deleteMany({ where: { name: { startsWith: 'Earlier quarter' } } })
  ;({ periodId: runningPeriodId } = await seedWeeklyBase(prisma))
  await seedFormFixtures(prisma)
  await startedCycle(runningPeriodId)
  earlierId = (await prisma.evaluationPeriod.create({
    data: { name: EARLIER, startDate: new Date('2026-07-01T00:00:00Z'), endDate: new Date('2026-09-30T00:00:00Z'), reviewStartDate: new Date('2026-10-05T00:00:00Z'), isActive: false },
  })).id
  process.env.WEEKLY_HR_FILLED_PARTNERS = F.chief.name
})
afterEach(() => {
  delete process.env.WEEKLY_HR_FILLED_PARTNERS
})
after(async () => {
  await prisma.$disconnect()
})

const bank = (relationshipType: 'PEER' | 'C_LEVEL') =>
  prisma.evaluationQuestion.findMany({ where: { relationshipType, orderIndex: { gte: 900 } }, orderBy: { orderIndex: 'asc' } })
const pin = (relationshipType: 'PEER' | 'DEPT', questionIds: string[], evaluatorId: string | null = null) =>
  prisma.evaluationPeriodQuestion.createMany({ data: questionIds.map((questionId, orderIndex) => ({ periodId: earlierId, relationshipType, evaluatorId, questionId, orderIndex: orderIndex + 1 })) })
const texts = async (periodId: string, relationshipType: 'PEER' | 'DEPT', evaluatorId: string, evaluateeId: string) =>
  (await getResolvedEvaluationQuestions({ relationshipType, periodId, evaluatorId, evaluateeId })).questions.map((q) => q.questionText)

test('a quarter with pinned questions uses them, in their order; every other quarter keeps today’s bank', WEEKLY_DB_TEST, async () => {
  const peer = await bank('PEER')
  const allPeer = await texts(runningPeriodId, 'PEER', W.ana.id, W.ben.id)
  await pin('PEER', [peer[2].id, peer[0].id])

  assert.deepEqual(await texts(earlierId, 'PEER', W.ana.id, W.ben.id), [peer[2].questionText, peer[0].questionText])
  assert.deepEqual(await texts(runningPeriodId, 'PEER', W.ana.id, W.ben.id), allPeer, 'the weekly round is untouched')

  // The late form an employee fills in for the pinned quarter shows only those questions.
  await setLateForms(HR_ACTOR, earlierId, true, NOW)
  const detail = await lateFormDetail(weeklyActor(W.ana), { periodId: earlierId, relationshipType: 'PEER', evaluateeId: W.ben.id }, NOW)
  assert.deepEqual(detail.questions.map((q) => q.text), [peer[2].questionText, peer[0].questionText])
})

test('one evaluator’s own set (a partner HR fills in) overrides the quarter’s set for them alone', WEEKLY_DB_TEST, async () => {
  const cLevel = (await bank('C_LEVEL')).filter((q) => q.questionType === 'RATING')
  const dept = await prisma.evaluationQuestion.findMany({ where: { relationshipType: 'DEPT', orderIndex: { gte: 950 } }, orderBy: { orderIndex: 'asc' } })
  await pin('DEPT', cLevel.map((q) => q.id), F.chief.id)

  const view = await formTables(HR_ACTOR, 'PARTNER', NOW, earlierId)
  const deptTable = view.tables.find((t) => t.relationshipType === 'DEPT')!
  assert.deepEqual(deptTable.questions.map((q) => q.text), cLevel.map((q) => q.questionText), 'the partner’s department table asks the C-Level questions')
  assert.deepEqual(await texts(earlierId, 'DEPT', W.lead.id, W.ana.id), dept.map((q) => q.questionText), 'anyone else keeps the bank')
  assert.deepEqual(await texts(runningPeriodId, 'DEPT', F.chief.id, W.ana.id), dept.map((q) => q.questionText), 'and the weekly round is untouched')
})

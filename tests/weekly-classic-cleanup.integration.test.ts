import test, { after, afterEach, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { classicDataReport, purgeClassicData } from '../lib/weekly/service/classic-cleanup'
import { WeeklyError } from '../lib/weekly/service/errors'
import { HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST } from './helpers/weekly-test-db'

let weeklyPeriodId = ''
const created: string[] = []
before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  ;({ periodId: weeklyPeriodId } = await seedWeeklyBase(prisma))
  await startedCycle(weeklyPeriodId)
  process.env.WEEKLY_TEST_TOOLS = 'true'
})
afterEach(async () => {
  delete process.env.WEEKLY_TEST_TOOLS
  if (!WEEKLY_DB_READY) return
  await prisma.evaluationPeriod.deleteMany({ where: { id: { in: created.splice(0) } } })
})
after(async () => {
  await prisma.$disconnect()
})

async function classicPeriod(name: string, withReport: boolean) {
  const period = await prisma.evaluationPeriod.create({
    data: { name, startDate: new Date('2026-04-01'), endDate: new Date('2026-06-30'), reviewStartDate: new Date('2026-07-05'), isActive: false },
  })
  created.push(period.id)
  await prisma.evaluation.createMany({
    data: [
      { evaluatorId: W.lead.id, evaluateeId: W.ana.id, periodId: period.id, ratingValue: 3, submittedAt: new Date('2026-06-20') },
      { evaluatorId: W.ben.id, evaluateeId: W.ana.id, periodId: period.id, ratingValue: 2, submittedAt: null },
    ],
  })
  if (withReport) await prisma.report.create({ data: { employeeId: W.ana.id, periodId: period.id, overallScore: 70, breakdownJson: {} } })
  return period.id
}

test('finished quarters keep their results; unfinished classic answers and every classic draft go; weekly quarters are untouched', WEEKLY_DB_TEST, async () => {
  const finished = await classicPeriod('Q2 test (finished)', true)
  const unfinished = await classicPeriod('Q3 test (in progress)', false)
  await prisma.evaluation.create({ data: { evaluatorId: W.lead.id, evaluateeId: W.ana.id, periodId: weeklyPeriodId, ratingValue: 3, submittedAt: null } })

  const report = await classicDataReport(HR_ACTOR)
  assert.deepEqual(report.filter((r) => created.includes(r.periodId)).map((r) => [r.periodName, r.submittedAnswers, r.drafts, r.removable]).sort(), [
    ['Q2 test (finished)', 1, 1, false], ['Q3 test (in progress)', 1, 1, true],
  ])
  assert.equal(report.some((r) => r.periodId === weeklyPeriodId), false)

  const result = await purgeClassicData(HR_ACTOR)
  assert.deepEqual([result.deletedAnswers, result.deletedDrafts], [1, 2])
  assert.equal(await prisma.evaluation.count({ where: { periodId: finished } }), 1, 'the finished quarter keeps its submitted answer')
  assert.equal(await prisma.evaluation.count({ where: { periodId: unfinished } }), 0)
  assert.equal(await prisma.evaluation.count({ where: { periodId: weeklyPeriodId, submittedAt: null } }), 1, 'a weekly form draft stays')
})

test('only with test tools on', WEEKLY_DB_TEST, async () => {
  delete process.env.WEEKLY_TEST_TOOLS
  await assert.rejects(purgeClassicData(HR_ACTOR), (e: unknown) => e instanceof WeeklyError && e.status === 404)
})

import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST } from './helpers/weekly-test-db'

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

const counts = () => Promise.all([
  prisma.weeklyAiSettings.count(), prisma.weeklyCalibrationItem.count(), prisma.weeklyCalibrationRun.count(), prisma.weeklyCalibrationResult.count(),
])

test('the calibration tables exist and the test reset clears them', WEEKLY_DB_TEST, async () => {
  const competency = await prisma.weeklyCompetency.findFirstOrThrow()
  const settings = await prisma.weeklyAiSettings.create({ data: { updatedAt: new Date('2026-10-05T04:00:00.000Z') } })
  assert.deepEqual([settings.id, settings.activeModel, settings.prices], ['default', null, {}])
  const item = await prisma.weeklyCalibrationItem.create({
    data: { competencyId: competency.id, question: 'Q?', situation: 'S', action: 'A', result: 'R', hrSufficiency: 'SUFFICIENT', hrScore: 3, createdById: W.hr.id },
  })
  const run = await prisma.weeklyCalibrationRun.create({ data: { kind: 'SET', model: 'stand-in', promptVersion: 'weekly-1', itemCount: 1, startedById: W.hr.id } })
  assert.deepEqual([run.status, run.summary, run.leaseUntil], ['RUNNING', null, null])
  const result = { runId: run.id, itemId: item.id, competencyId: competency.id, targetSufficiency: 'SUFFICIENT', targetScore: 3 }
  await prisma.weeklyCalibrationResult.create({ data: result })
  await assert.rejects(prisma.weeklyCalibrationResult.create({ data: result }), 'one result per item per run')
  assert.deepEqual(await counts(), [1, 1, 1, 1])
  await resetWeeklyTestData(prisma)
  assert.deepEqual(await counts(), [0, 0, 0, 0])
})

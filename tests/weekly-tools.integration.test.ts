import test, { after, afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { WeeklyError } from '../lib/weekly/service/errors'
import { weeklyCycleIdForPeriod } from '../lib/weekly/service/legacy'
import { approveAllDrafts, fillSynthetic, releaseNextWeek, resetCycle } from '../lib/weekly/service/test-tools'
import { syncFromQuestionBank } from '../lib/weekly/service/content'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
let periodId = ''
let cycleId = ''

beforeEach(async () => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
  process.env.WEEKLY_TEST_TOOLS = 'true'
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  ;({ periodId } = await seedWeeklyBase(prisma))
  ;({ cycleId } = await startedCycle(periodId))
})
afterEach(() => {
  delete process.env.WEEKLY_TEST_TOOLS
  delete process.env.WEEKLY_EVALUATIONS_ENABLED
})
after(async () => {
  await prisma.$disconnect()
})

test('releasing the next week moves the cycle forward one week at a time', WEEKLY_DB_TEST, async () => {
  assert.equal((await releaseNextWeek(HR_ACTOR, cycleId, at(1))).week, 1)
  assert.equal((await releaseNextWeek(HR_ACTOR, cycleId, at(1))).week, 2)
  assert.equal((await prisma.weeklyCycle.findUniqueOrThrow({ where: { id: cycleId } })).simulatedWeek, 2)
})

test('synthetic answers fill every open question with a valid answer', WEEKLY_DB_TEST, async () => {
  await releaseNextWeek(HR_ACTOR, cycleId, at(1))
  assert.deepEqual(await fillSynthetic(HR_ACTOR, cycleId, W.lead.id, at(1)), { answered: 1 })
  assert.deepEqual(await fillSynthetic(HR_ACTOR, cycleId, undefined, at(1)), { answered: 2 })
  const prompts = await prisma.weeklyPrompt.findMany()
  assert.ok(prompts.every((p) => p.status === 'SUBMITTED'))
  assert.equal(await prisma.weeklyScoringJob.count(), 3)
  assert.ok((await prisma.weeklyAuditEvent.count({ where: { action: 'TEST_FILL' } })) >= 2)
})

test('approve-all approves every draft; reset clears the cycle’s answers', WEEKLY_DB_TEST, async () => {
  await prisma.weeklyProfile.deleteMany()
  await prisma.weeklyCompetencyPrompt.deleteMany()
  await prisma.weeklyCompetency.deleteMany()
  await syncFromQuestionBank(HR_ACTOR)
  assert.deepEqual(await approveAllDrafts(HR_ACTOR), { approved: 11 })
  await releaseNextWeek(HR_ACTOR, cycleId, at(1))
  await fillSynthetic(HR_ACTOR, cycleId, undefined, at(1))
  await resetCycle(HR_ACTOR, cycleId)
  assert.deepEqual([await prisma.weeklyPrompt.count(), await prisma.weeklySlot.count(), await prisma.weeklyScoringJob.count()], [0, 0, 0])
  assert.equal((await prisma.weeklyCycle.findUniqueOrThrow({ where: { id: cycleId } })).simulatedWeek, null)
})

test('the tools refuse without the flag or for non-HR', WEEKLY_DB_TEST, async () => {
  await assert.rejects(releaseNextWeek(weeklyActor(W.ana), cycleId, at(1)), isStatus(403))
  process.env.WEEKLY_TEST_TOOLS = 'false'
  await assert.rejects(releaseNextWeek(HR_ACTOR, cycleId, at(1)), isStatus(404))
})

test('a period with a weekly cycle closes the classic questionnaire only while the module is on', WEEKLY_DB_TEST, async () => {
  assert.equal(await weeklyCycleIdForPeriod(periodId), cycleId)
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'false'
  assert.equal(await weeklyCycleIdForPeriod(periodId), null)
})

import test, { after, afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { WeeklyError } from '../lib/weekly/service/errors'
import { fillSynthetic, releaseNextWeek, resetCycle } from '../lib/weekly/service/test-tools'
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

test('synthetic answers choose a middling statement for every open question', WEEKLY_DB_TEST, async () => {
  await releaseNextWeek(HR_ACTOR, cycleId, at(1))
  assert.deepEqual(await fillSynthetic(HR_ACTOR, cycleId, W.lead.id, at(1)), { answered: 1 })
  assert.deepEqual(await fillSynthetic(HR_ACTOR, cycleId, undefined, at(1)), { answered: 2 })
  const prompts = await prisma.weeklyPrompt.findMany()
  assert.ok(prompts.every((p) => p.status === 'SUBMITTED'))
  const scores = (await prisma.weeklyResponse.findMany()).map((r) => r.level)
  assert.equal(scores.length, 3)
  assert.ok(scores.every((s) => s !== null && s >= 2 && s <= 3.5))
  assert.ok((await prisma.weeklyAuditEvent.count({ where: { action: 'TEST_FILL' } })) >= 2)
})

test('reset clears the cycle’s answers', WEEKLY_DB_TEST, async () => {
  await releaseNextWeek(HR_ACTOR, cycleId, at(1))
  await fillSynthetic(HR_ACTOR, cycleId, undefined, at(1))
  await resetCycle(HR_ACTOR, cycleId)
  assert.deepEqual([await prisma.weeklyPrompt.count(), await prisma.weeklySlot.count(), await prisma.weeklyResponse.count()], [0, 0, 0])
  assert.equal((await prisma.weeklyCycle.findUniqueOrThrow({ where: { id: cycleId } })).simulatedWeek, null)
})

test('the tools refuse without the flag or for non-HR', WEEKLY_DB_TEST, async () => {
  await assert.rejects(releaseNextWeek(weeklyActor(W.ana), cycleId, at(1)), isStatus(403))
  process.env.WEEKLY_TEST_TOOLS = 'false'
  await assert.rejects(releaseNextWeek(HR_ACTOR, cycleId, at(1)), isStatus(404))
})


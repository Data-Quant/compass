import test, { after, afterEach, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { WeeklyError } from '../lib/weekly/service/errors'
import { askPairNow } from '../lib/weekly/service/test-tools'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST } from './helpers/weekly-test-db'

const isError = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
let cycleId = ''
before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  const { periodId } = await seedWeeklyBase(prisma)
  ;({ cycleId } = await startedCycle(periodId))
  process.env.WEEKLY_TEST_TOOLS = 'true'
})
afterEach(() => {
  delete process.env.WEEKLY_TEST_TOOLS
})
after(async () => {
  await prisma.$disconnect()
})

test('asking one pair now gives that evaluator every topic about that person, and nobody else a thing', WEEKLY_DB_TEST, async () => {
  const result = await askPairNow(HR_ACTOR, cycleId, { evaluatorId: W.ana.id, evaluateeId: W.lead.id }, at(1))
  const prompts = await prisma.weeklyPrompt.findMany({ where: { cycleId } })
  assert.ok(result.prompts > 0)
  assert.equal(prompts.length, result.prompts)
  assert.ok(prompts.every((p) => p.evaluatorId === W.ana.id && p.evaluateeId === W.lead.id && p.status === 'OPEN'))
  // A second press adds nothing while those questions are open.
  assert.equal((await askPairNow(HR_ACTOR, cycleId, { evaluatorId: W.ana.id, evaluateeId: W.lead.id }, at(1))).prompts, 0)
})

test('only mapped pairs, only with test tools on', WEEKLY_DB_TEST, async () => {
  await assert.rejects(askPairNow(HR_ACTOR, cycleId, { evaluatorId: W.cara.id, evaluateeId: W.lead.id }, at(1)), isError(409))
  delete process.env.WEEKLY_TEST_TOOLS
  await assert.rejects(askPairNow(HR_ACTOR, cycleId, { evaluatorId: W.ana.id, evaluateeId: W.lead.id }, at(1)), isError(404))
})

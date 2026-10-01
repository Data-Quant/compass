import test, { after, afterEach, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { WeeklyError } from '../lib/weekly/service/errors'
import { releaseWeek } from '../lib/weekly/service/release'
import { askPairNow, pairsFor, releaseWeekFor } from '../lib/weekly/service/test-tools'
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

test('asking one pair now gives that evaluator their next question about that person, one at a time', WEEKLY_DB_TEST, async () => {
  const result = await askPairNow(HR_ACTOR, cycleId, { evaluatorId: W.ana.id, evaluateeId: W.lead.id }, at(1))
  assert.equal(result.prompts, 1)
  const prompts = await prisma.weeklyPrompt.findMany({ where: { cycleId } })
  assert.equal(prompts.length, 1)
  assert.ok(prompts.every((p) => p.evaluatorId === W.ana.id && p.evaluateeId === W.lead.id && p.status === 'OPEN' && p.kind === 'STANDARD'))
  // A second press waits for the open question to be answered.
  await assert.rejects(askPairNow(HR_ACTOR, cycleId, { evaluatorId: W.ana.id, evaluateeId: W.lead.id }, at(1)), isError(409))
})

test('releasing this week for one evaluator asks only them, one question per chosen person, once', WEEKLY_DB_TEST, async () => {
  const summary = await releaseWeekFor(HR_ACTOR, cycleId, W.ana.id, at(1))
  assert.deepEqual([summary.week, summary.evaluatorsReleased], [1, 1])
  const prompts = await prisma.weeklyPrompt.findMany({ where: { cycleId } })
  assert.ok(prompts.length >= 1)
  assert.equal(prompts.length, summary.promptsCreated)
  assert.ok(prompts.every((p) => p.evaluatorId === W.ana.id))
  assert.equal(new Set(prompts.map((p) => p.evaluateeId)).size, prompts.length, 'never two questions about one person in a week')
  assert.equal((await releaseWeekFor(HR_ACTOR, cycleId, W.ana.id, at(1))).evaluatorsReleased, 0, 'already released for them this week')
  await releaseWeek(cycleId, 1, at(1))
  assert.equal(await prisma.weeklyPrompt.count({ where: { cycleId, evaluatorId: W.ana.id } }), prompts.length, 'the full release leaves them alone')
})

test('only mapped pairs, only with test tools on', WEEKLY_DB_TEST, async () => {
  await assert.rejects(askPairNow(HR_ACTOR, cycleId, { evaluatorId: W.cara.id, evaluateeId: W.lead.id }, at(1)), isError(409))
  delete process.env.WEEKLY_TEST_TOOLS
  await assert.rejects(askPairNow(HR_ACTOR, cycleId, { evaluatorId: W.ana.id, evaluateeId: W.lead.id }, at(1)), isError(404))
})

test('the pair picker lists only the people an evaluator really evaluates, with the relationship', WEEKLY_DB_TEST, async () => {
  const pairs = await pairsFor(HR_ACTOR, cycleId, W.ana.id, at(1))
  assert.deepEqual(pairs.map((p) => [p.evaluatee.name, p.perspective]).sort(), [[W.ben.name, 'As a peer'], [W.lead.name, 'As a member of their team']].sort())
  assert.deepEqual(await pairsFor(HR_ACTOR, cycleId, W.cara.id, at(1)), [])
})

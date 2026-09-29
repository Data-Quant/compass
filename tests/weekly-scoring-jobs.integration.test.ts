import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { fakeModel } from '../lib/weekly/ai/model'
import { submitAnswer } from '../lib/weekly/service/inbox'
import { claimJobs, runScoring, scoreClaimedJob } from '../lib/weekly/service/scoring'
import { answerAs, answerFor, failingModel, releaseWeekOne, scoringClock, spyModel } from './helpers/weekly-answers'
import { startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

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

const job = (responseId: string) => prisma.weeklyScoringJob.findFirstOrThrow({ where: { responseId }, orderBy: { revision: 'desc' } })
const run = (model: Parameters<typeof runScoring>[0]['model'], seconds = 0) => runScoring({ model, budgetMs: 30_000, clock: () => scoringClock(seconds) })

test('two workers claiming at once each get different jobs, never the same one', WEEKLY_DB_TEST, async () => {
  const prompts = await releaseWeekOne(cycleId)
  for (const prompt of prompts) await answerAs(prompt, 'solid')
  const [a, b] = await Promise.all([claimJobs({ now: scoringClock(), limit: 10 }), claimJobs({ now: scoringClock(), limit: 10 })])
  const ids = [...a, ...b].map((j) => j.id)
  assert.equal(ids.length, prompts.length)
  assert.equal(new Set(ids).size, prompts.length)
})

test('a worker whose lease expired and was taken over cannot write a score', WEEKLY_DB_TEST, async () => {
  const [prompt] = await releaseWeekOne(cycleId)
  const responseId = await answerAs(prompt, 'solid')
  const [slow] = await claimJobs({ now: scoringClock(), limit: 1 })
  const [fast] = await claimJobs({ now: scoringClock(180), limit: 1 })
  assert.equal(fast.id, slow.id)
  assert.equal(await scoreClaimedJob(slow, fakeModel(), scoringClock(181)), 'LOST_LEASE')
  assert.equal(await prisma.weeklyAiScore.count({ where: { responseId } }), 0)
  assert.equal(await scoreClaimedJob(fast, fakeModel(), scoringClock(182)), 'SCORED')
  assert.equal(await prisma.weeklyAiScore.count({ where: { responseId } }), 1)
})

test('an edit made while the old text is being scored makes that job stale; only the new text is scored', WEEKLY_DB_TEST, async () => {
  const prompt = (await releaseWeekOne(cycleId)).find((p) => p.evaluatorId === W.lead.id)!
  const responseId = await answerAs(prompt, 'praise')
  const [old] = await claimJobs({ now: scoringClock(), limit: 1 })
  await submitAnswer(weeklyActor(W.lead), { evaluatorId: W.lead.id, actingAs: false }, prompt.id, answerFor('strong', prompt), scoringClock(60))
  assert.equal(await scoreClaimedJob(old, fakeModel(), scoringClock(61)), 'STALE')
  assert.equal(await prisma.weeklyAiScore.count({ where: { responseId } }), 0)
  assert.equal((await run(fakeModel(), 62)).scored, 1)
  const ai = await prisma.weeklyAiScore.findFirstOrThrow({ where: { responseId } })
  assert.deepEqual([ai.revision, ai.score], [2, 4])
  assert.equal(await prisma.weeklyPrompt.count({ where: { slotId: prompt.slotId, kind: 'FOLLOW_UP' } }), 0)
})

test('provider errors are retried twice with a pause, then the job fails into the manual queue', WEEKLY_DB_TEST, async () => {
  const [prompt] = await releaseWeekOne(cycleId)
  const responseId = await answerAs(prompt, 'solid')
  const model = failingModel('RATE_LIMITED')
  assert.equal((await run(model, 0)).retried, 1)
  assert.deepEqual((await run(model, 1)).retried, 0, 'not before the pause')
  assert.equal((await run(model, 10)).retried, 1)
  const summary = await run(model, 60)
  assert.deepEqual([summary.failed, summary.remaining], [1, 0])
  const failed = await job(responseId)
  assert.deepEqual([failed.status, failed.attempts, failed.error], ['FAILED', 3, 'RATE_LIMITED'])
  assert.equal(failed.updatedAt.getTime(), scoringClock(60).getTime())
})

test('no model and unusable output: the first fails at once, the second is retried', WEEKLY_DB_TEST, async () => {
  const prompts = await releaseWeekOne(cycleId)
  const first = await answerAs(prompts[0], 'solid')
  assert.equal((await runScoring({ model: null, budgetMs: 10_000, clock: () => scoringClock(), responseIds: [first] })).failed, 1)
  assert.equal((await job(first)).error, 'NOT_CONFIGURED')
  const second = await answerAs(prompts[1], 'solid')
  assert.equal((await runScoring({ model: spyModel({ nonsense: true }), budgetMs: 10_000, clock: () => scoringClock(), responseIds: [second] })).retried, 1)
  assert.equal((await job(second)).error, 'INVALID_OUTPUT')
})

test('a job whose last lease expires is failed rather than retried forever', WEEKLY_DB_TEST, async () => {
  const [prompt] = await releaseWeekOne(cycleId)
  const responseId = await answerAs(prompt, 'solid')
  for (const minute of [0, 3, 6]) assert.equal((await claimJobs({ now: scoringClock(minute * 60), limit: 1 })).length, 1)
  assert.equal((await claimJobs({ now: scoringClock(9 * 60), limit: 1 })).length, 0)
  const expired = await job(responseId)
  assert.deepEqual([expired.status, expired.error], ['FAILED', 'LEASE_EXPIRED'])
})

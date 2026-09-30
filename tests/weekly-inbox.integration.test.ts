import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { WeeklyError } from '../lib/weekly/service/errors'
import { historyView, inboxView, markNotObserved, resolveSubject, saveDraft, submitAnswer } from '../lib/weekly/service/inbox'
import { releaseWeek } from '../lib/weekly/service/release'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
const GOOD = {
  situation: `The client moved the launch forward a week ${words(8)}`,
  action: `They rebuilt the plan the same afternoon ${words(10)}`,
  result: `We delivered on time with no rework ${words(10)}`,
}
const lead = weeklyActor(W.lead)
const leadSubject = { evaluatorId: W.lead.id, actingAs: false }
let cycleId = ''

before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  const { periodId } = await seedWeeklyBase(prisma)
  ;({ cycleId } = await startedCycle(periodId))
  await releaseWeek(cycleId, 1, at(1))
})
after(async () => {
  delete process.env.WEEKLY_TEST_TOOLS
  await prisma.$disconnect()
})

const leadPromptId = async () => (await inboxView(W.lead.id, at(1))).prompts[0].id

test('each evaluator sees only their own questions', WEEKLY_DB_TEST, async () => {
  const inbox = await inboxView(W.lead.id, at(1))
  assert.equal(inbox.prompts.length, 1)
  assert.equal(inbox.cycle?.currentWeek, 1)
  assert.ok([W.ana.id, W.ben.id].includes(inbox.prompts[0].evaluatee.id))
  assert.equal(inbox.prompts[0].perspective, 'LEAD')
  assert.ok(inbox.progress.length >= 2)
  await assert.rejects(saveDraft(weeklyActor(W.ana), { evaluatorId: W.ana.id, actingAs: false }, inbox.prompts[0].id, GOOD, at(1)), isStatus(404))
})

test('drafts autosave; a complete answer is submitted and queued for scoring', WEEKLY_DB_TEST, async () => {
  const promptId = await leadPromptId()
  await saveDraft(lead, leadSubject, promptId, { ...GOOD, result: '' }, at(1))
  assert.equal((await inboxView(W.lead.id, at(1))).prompts[0].status, 'DRAFT')
  await assert.rejects(submitAnswer(lead, leadSubject, promptId, { ...GOOD, result: '' }, at(1)), /as a result/)
  assert.deepEqual(await submitAnswer(lead, leadSubject, promptId, GOOD, at(1)), { status: 'SUBMITTED', revision: 1 })
  const jobs = await prisma.weeklyScoringJob.findMany()
  assert.deepEqual(jobs.map((j) => `${j.revision}:${j.status}`), ['1:PENDING'])
})

test('a late autosave after submitting changes nothing', WEEKLY_DB_TEST, async () => {
  const promptId = await leadPromptId()
  await submitAnswer(lead, leadSubject, promptId, GOOD, at(1))
  await assert.rejects(saveDraft(lead, leadSubject, promptId, { situation: 'overwritten', action: '', result: '' }, at(1)), isStatus(409))
  const response = await prisma.weeklyResponse.findUniqueOrThrow({ where: { promptId } })
  assert.match(response.situation, /client moved the launch/)
  assert.equal((await prisma.weeklyPrompt.findUniqueOrThrow({ where: { id: promptId } })).status, 'SUBMITTED')
})

test('an answer can be edited for 24 hours; each edit re-queues scoring', WEEKLY_DB_TEST, async () => {
  const promptId = await leadPromptId()
  await submitAnswer(lead, leadSubject, promptId, GOOD, at(1))
  assert.equal((await submitAnswer(lead, leadSubject, promptId, { ...GOOD, result: `${GOOD.result} more detail` }, at(1, 1, 20))).revision, 2)
  const jobs = await prisma.weeklyScoringJob.findMany({ orderBy: { revision: 'asc' } })
  assert.deepEqual(jobs.map((j) => `${j.revision}:${j.status}`), ['1:CANCELLED', '2:PENDING'])
  await assert.rejects(submitAnswer(lead, leadSubject, promptId, GOOD, at(1, 3, 9)), /no longer be edited/)
})

test('not observed snoozes the topic three weeks; a second time closes it', WEEKLY_DB_TEST, async () => {
  const promptId = await leadPromptId()
  await markNotObserved(lead, leadSubject, promptId, at(1))
  const prompt = await prisma.weeklyPrompt.findUniqueOrThrow({ where: { id: promptId } })
  assert.equal(prompt.status, 'NOT_OBSERVED')
  const slot = await prisma.weeklySlot.findUniqueOrThrow({ where: { id: prompt.slotId ?? '' } })
  assert.deepEqual([slot.status, slot.snoozedUntilWeek, slot.notObservedCount], ['OPEN', 4, 1])
  const again = await prisma.weeklyPrompt.create({
    data: { cycleId, slotId: slot.id, evaluatorId: W.lead.id, evaluateeId: slot.evaluateeId, relationshipType: slot.relationshipType, weekIndex: 4, textSnapshot: prompt.textSnapshot, releasedAt: at(4) },
  })
  await markNotObserved(lead, leadSubject, again.id, at(4))
  assert.equal((await prisma.weeklySlot.findUniqueOrThrow({ where: { id: slot.id } })).status, 'CLOSED_NOT_OBSERVED')
})

test('history shows every answer with an evaluator-facing status and no score', WEEKLY_DB_TEST, async () => {
  const promptId = await leadPromptId()
  await submitAnswer(lead, leadSubject, promptId, GOOD, at(1))
  const entry = (await historyView(W.lead.id)).groups.flatMap((g) => g.entries).find((e) => e.id === promptId)
  assert.equal(entry?.status, 'BEING_REVIEWED')
  assert.match(entry?.answer?.situation ?? '', /^The client moved/)
  assert.equal(Object.keys(entry ?? {}).includes('score'), false)
})

test('HR can act as someone only with the test tools on', WEEKLY_DB_TEST, async () => {
  process.env.WEEKLY_TEST_TOOLS = 'false'
  await assert.rejects(resolveSubject(HR_ACTOR, W.lead.id), isStatus(403))
  process.env.WEEKLY_TEST_TOOLS = 'true'
  assert.deepEqual(await resolveSubject(HR_ACTOR, W.lead.id), { evaluatorId: W.lead.id, actingAs: true })
  await assert.rejects(resolveSubject(weeklyActor(W.ana), W.lead.id), isStatus(403))
  assert.deepEqual(await resolveSubject(weeklyActor(W.ana), null), { evaluatorId: W.ana.id, actingAs: false })
})

import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { parseOptions } from '../lib/weekly/mcq'
import { WeeklyError } from '../lib/weekly/service/errors'
import { historyView, inboxView, markNotObserved, resolveSubject, saveDraft, submitAnswer, submitWeek } from '../lib/weekly/service/inbox'
import { QUESTIONS_PER_PAIR } from '../lib/weekly/scheduler'
import { releaseWeek } from '../lib/weekly/service/release'
import { optionWithScore } from './helpers/weekly-answers'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
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
const choose = (promptId: string, score: number, note: string | null = null, when = at(1)) =>
  optionWithScore(promptId, score).then((optionId) => submitAnswer(lead, leadSubject, promptId, { optionId, note }, when))

test('each evaluator sees only their own questions: 8 statements, no scores, the person’s name in the question', WEEKLY_DB_TEST, async () => {
  const inbox = await inboxView(W.lead.id, at(1))
  assert.equal(inbox.prompts.length, 1)
  const [prompt] = inbox.prompts
  assert.ok([W.ana.id, W.ben.id].includes(prompt.evaluatee.id))
  assert.equal(prompt.perspective, 'LEAD')
  assert.equal(prompt.options.length, 8)
  assert.ok(prompt.options.every((o) => !('score' in o)), 'evaluators never see scores')
  assert.doesNotMatch(prompt.text, /\[name\]/)
  assert.ok(inbox.progress.length >= 2)
  await assert.rejects(saveDraft(weeklyActor(W.ana), { evaluatorId: W.ana.id, actingAs: false }, prompt.id, { note: 'x' }, at(1)), isStatus(404))
})

test('the order is shuffled once at release and kept; the chosen statement’s level is stored and the model is asked to score it', WEEKLY_DB_TEST, async () => {
  const promptId = await leadPromptId()
  const stored = parseOptions((await prisma.weeklyPrompt.findUniqueOrThrow({ where: { id: promptId } })).options)
  assert.deepEqual((await inboxView(W.lead.id, at(1, 3))).prompts[0].options.map((o) => o.id), stored.map((o) => o.id))
  assert.notDeepEqual(stored.map((o) => o.score), [...stored.map((o) => o.score)].sort(), 'not in score order')
  assert.deepEqual(await choose(promptId, 2.5), { status: 'SUBMITTED', revision: 1 })
  const response = await prisma.weeklyResponse.findUniqueOrThrow({ where: { promptId } })
  assert.equal(response.level, 2.5)
  assert.equal(await prisma.weeklyScoringJob.count({ where: { responseId: response.id, revision: 1, status: 'PENDING' } }), 1)
  const prompt = await prisma.weeklyPrompt.findUniqueOrThrow({ where: { id: promptId }, include: { slot: true } })
  assert.equal(prompt.slot?.status, 'SATISFIED')
})

test('a note is required for 1, 1.5 and 4, and optional otherwise', WEEKLY_DB_TEST, async () => {
  const promptId = await leadPromptId()
  await assert.rejects(choose(promptId, 1.5), /note/)
  await assert.rejects(choose(promptId, 1, '   '), /note/)
  await choose(promptId, 1.5, 'Missed two handovers this month.')
  assert.equal((await prisma.weeklyResponse.findUniqueOrThrow({ where: { promptId } })).note, 'Missed two handovers this month.')
  await assert.rejects(submitAnswer(lead, leadSubject, promptId, { optionId: 'o99' }, at(1)), /Choose one/)
})

test('a draft keeps a note typed before choosing, and a late autosave after submitting changes nothing', WEEKLY_DB_TEST, async () => {
  const promptId = await leadPromptId()
  await saveDraft(lead, leadSubject, promptId, { note: 'Thinking about it' }, at(1))
  assert.equal((await inboxView(W.lead.id, at(1))).prompts[0].status, 'DRAFT')
  assert.equal((await inboxView(W.lead.id, at(1))).prompts[0].answer?.note, 'Thinking about it')
  await choose(promptId, 3)
  await assert.rejects(saveDraft(lead, leadSubject, promptId, { note: 'overwritten' }, at(1)), isStatus(409))
  assert.equal((await prisma.weeklyResponse.findUniqueOrThrow({ where: { promptId } })).level, 3)
})

test('an answer can be changed until the Sunday of the week it was given; then the week is locked', WEEKLY_DB_TEST, async () => {
  const promptId = await leadPromptId()
  await choose(promptId, 2, null, at(1, 2))
  assert.equal((await choose(promptId, 3, null, at(1, 7, 18))).revision, 2, 'still Sunday')
  assert.equal((await prisma.weeklyResponse.findUniqueOrThrow({ where: { promptId } })).level, 3)
  const entry = async (now: Date) => (await historyView(W.lead.id, now)).groups.flatMap((g) => g.entries).find((e) => e.id === promptId)
  assert.equal((await entry(at(1, 7)))?.canEdit, true)
  await assert.rejects(choose(promptId, 2, null, at(2)), /locked/, 'Monday of the next week')
  assert.equal((await entry(at(2)))?.canEdit, false)
  assert.equal((await inboxView(W.lead.id, at(1, 3))).prompts.find((p) => p.id === promptId)?.canEdit, true)
})

test('the quarter lock freezes answers even within their week', WEEKLY_DB_TEST, async () => {
  const promptId = await leadPromptId()
  await choose(promptId, 2, null, at(1, 2))
  await prisma.evaluationPeriod.updateMany({ data: { isLocked: true } })
  await assert.rejects(choose(promptId, 3, null, at(1, 3)), /locked/)
})

test('Submit this week works once every question has an answer, and says until when answers can change', WEEKLY_DB_TEST, async () => {
  await assert.rejects(submitWeek(leadSubject, at(1, 2)), /Answer every question/)
  await choose(await leadPromptId(), 3, null, at(1, 2))
  const done = await submitWeek(leadSubject, at(1, 3))
  assert.equal(done.submittedAt, at(1, 3).toISOString())
  assert.equal((await inboxView(W.lead.id, at(1, 3))).weekSubmittedAt, at(1, 3).toISOString())
  assert.equal((await submitWeek(leadSubject, at(1, 4))).submittedAt, at(1, 3).toISOString(), 'submitting again keeps the first time')
  assert.equal((await inboxView(W.lead.id, at(2))).weekSubmittedAt, null, 'a new week starts unsubmitted')
})

test('not observed snoozes the topic three weeks; a second time closes it', WEEKLY_DB_TEST, async () => {
  const promptId = await leadPromptId()
  await markNotObserved(lead, leadSubject, promptId, at(1))
  const prompt = await prisma.weeklyPrompt.findUniqueOrThrow({ where: { id: promptId } })
  assert.equal(prompt.status, 'NOT_OBSERVED')
  const slot = await prisma.weeklySlot.findUniqueOrThrow({ where: { id: prompt.slotId ?? '' } })
  assert.deepEqual([slot.status, slot.snoozedUntilWeek, slot.notObservedCount], ['OPEN', 4, 1])
  const again = await prisma.weeklyPrompt.create({
    data: { cycleId, slotId: slot.id, evaluatorId: W.lead.id, evaluateeId: slot.evaluateeId, relationshipType: slot.relationshipType, weekIndex: 4, textSnapshot: prompt.textSnapshot, options: prompt.options ?? undefined, releasedAt: at(4) },
  })
  await markNotObserved(lead, leadSubject, again.id, at(4))
  assert.equal((await prisma.weeklySlot.findUniqueOrThrow({ where: { id: slot.id } })).status, 'CLOSED_NOT_OBSERVED')
})

test('history shows every answer with the chosen statement and no score', WEEKLY_DB_TEST, async () => {
  const promptId = await leadPromptId()
  await choose(promptId, 3)
  const entry = (await historyView(W.lead.id)).groups.flatMap((g) => g.entries).find((e) => e.id === promptId)
  assert.equal(entry?.status, 'SUBMITTED')
  assert.equal(entry?.answer?.optionId, await optionWithScore(promptId, 3))
  assert.equal(entry?.options.length, 8)
  assert.ok(entry?.options.every((o) => !('score' in o)))
})

test('HR can act as someone only with the test tools on', WEEKLY_DB_TEST, async () => {
  process.env.WEEKLY_TEST_TOOLS = 'false'
  await assert.rejects(resolveSubject(HR_ACTOR, W.lead.id), isStatus(403))
  process.env.WEEKLY_TEST_TOOLS = 'true'
  assert.deepEqual(await resolveSubject(HR_ACTOR, W.lead.id), { evaluatorId: W.lead.id, actingAs: true })
  await assert.rejects(resolveSubject(weeklyActor(W.ana), W.lead.id), isStatus(403))
  assert.deepEqual(await resolveSubject(weeklyActor(W.ana), null), { evaluatorId: W.ana.id, actingAs: false })
})

test('progress counts the five questions a quarter about each person and moves on answering', WEEKLY_DB_TEST, async () => {
  const promptId = await leadPromptId()
  const evaluateeId = (await inboxView(W.lead.id, at(1))).prompts[0].evaluatee.id
  const before = (await inboxView(W.lead.id, at(1))).progress.find((p) => p.evaluatee.id === evaluateeId)!
  assert.deepEqual([before.answered, before.satisfied, before.total], [0, 0, QUESTIONS_PER_PAIR])
  await choose(promptId, 2)
  const after = (await inboxView(W.lead.id, at(1))).progress.find((p) => p.evaluatee.id === evaluateeId)!
  assert.deepEqual([after.answered, after.satisfied, after.total], [1, 1, QUESTIONS_PER_PAIR])
})

test('once the round closes, the page says so and keeps a read-only history of answers', WEEKLY_DB_TEST, async () => {
  const promptId = await leadPromptId()
  await choose(promptId, 3)
  await prisma.weeklyPrompt.updateMany({ where: { cycleId, status: { in: ['OPEN', 'DRAFT'] } }, data: { status: 'EXPIRED' } })
  await prisma.weeklyCycle.update({ where: { id: cycleId }, data: { status: 'CLOSED', closedAt: at(14) } })
  const inbox = await inboxView(W.lead.id, at(14))
  assert.deepEqual([inbox.cycle?.status, inbox.prompts.length], ['CLOSED', 0])
  const history = await historyView(W.lead.id)
  assert.equal(history.cycle?.status, 'CLOSED')
  const entries = history.groups.flatMap((g) => g.entries)
  assert.ok(entries.some((e) => e.id === promptId && e.status === 'SUBMITTED'))
  assert.ok(entries.every((e) => !e.canEdit), 'read-only once closed')
})

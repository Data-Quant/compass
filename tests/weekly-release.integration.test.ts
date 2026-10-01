import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { setOptIn } from '../lib/weekly/service/cycles'
import { WeeklyError } from '../lib/weekly/service/errors'
import { submitAnswer } from '../lib/weekly/service/inbox'
import { releaseWeek } from '../lib/weekly/service/release'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
let cycleId = ''

beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  const { periodId } = await seedWeeklyBase(prisma)
  ;({ cycleId } = await startedCycle(periodId))
})
after(async () => {
  await prisma.$disconnect()
})

test('slots follow the mappings in both directions, with each perspective’s topics', WEEKLY_DB_TEST, async () => {
  await releaseWeek(cycleId, 1, at(1))
  const slots = await prisma.weeklySlot.findMany({ include: { competency: true } })
  const leadAboutAna = slots.filter((s) => s.evaluatorId === W.lead.id && s.evaluateeId === W.ana.id)
  assert.equal(leadAboutAna.length, 4)
  assert.ok(leadAboutAna.every((s) => s.relationshipType === 'TEAM_LEAD' && s.competency.perspective === 'LEAD'))
  const anaAboutLead = slots.filter((s) => s.evaluatorId === W.ana.id && s.evaluateeId === W.lead.id)
  assert.equal(anaAboutLead.length, 4)
  assert.ok(anaAboutLead.every((s) => s.relationshipType === 'DIRECT_REPORT' && s.competency.perspective === 'UPWARD'))
  const peerSlots = slots.filter((s) => s.relationshipType === 'PEER')
  assert.equal(peerSlots.length, 6)
  assert.ok(peerSlots.every((s) => s.competency.perspective === 'PEER'))
  assert.equal(slots.length, 22)
})

test('week 1 gives each evaluator a paced question about one of the people they evaluate', WEEKLY_DB_TEST, async () => {
  const summary = await releaseWeek(cycleId, 1, at(1))
  assert.deepEqual([summary.evaluatorsReleased, summary.promptsCreated], [3, 3])
  const prompts = await prisma.weeklyPrompt.findMany({ include: { slot: true } })
  for (const prompt of prompts) {
    assert.equal(prompt.slot?.evaluatorId, prompt.evaluatorId)
    assert.equal(prompt.slot?.evaluateeId, prompt.evaluateeId)
    assert.equal(prompt.status, 'OPEN')
    assert.ok(prompt.textSnapshot.length > 20)
  }
  const leadPrompt = prompts.find((p) => p.evaluatorId === W.lead.id)
  assert.ok(leadPrompt && [W.ana.id, W.ben.id].includes(leadPrompt.evaluateeId))
})

test('releasing a week twice, even at the same moment, never duplicates questions', WEEKLY_DB_TEST, async () => {
  await Promise.all([releaseWeek(cycleId, 1, at(1)), releaseWeek(cycleId, 1, at(1))])
  await releaseWeek(cycleId, 1, at(1))
  assert.equal(await prisma.weeklyPrompt.count(), 3)
  assert.equal(await prisma.weeklyRelease.count(), 3)
})

test('a person with an open question is not asked about again; the evaluator gets someone else', WEEKLY_DB_TEST, async () => {
  await releaseWeek(cycleId, 1, at(1))
  await releaseWeek(cycleId, 2, at(2))
  const prompts = await prisma.weeklyPrompt.findMany()
  assert.equal(prompts.length, 6)
  for (const evaluatorId of [W.lead.id, W.ana.id, W.ben.id]) {
    const mine = prompts.filter((p) => p.evaluatorId === evaluatorId)
    assert.equal(new Set(mine.map((p) => p.evaluateeId)).size, 2, 'week 2 is about the other person')
  }
  // Week 3: both of everyone's questions are still open, so nothing piles up.
  await releaseWeek(cycleId, 3, at(3))
  assert.equal(await prisma.weeklyPrompt.count(), 6)
})

test('a leaver’s questions are cancelled, as evaluator and as the person asked about', WEEKLY_DB_TEST, async () => {
  await releaseWeek(cycleId, 1, at(1))
  await prisma.payrollEmployeeProfile.create({ data: { userId: W.ben.id, isPayrollActive: false, exitDate: at(2, 1, 0) } })
  const summary = await releaseWeek(cycleId, 2, at(2))
  const benSlots = await prisma.weeklySlot.findMany({ where: { OR: [{ evaluatorId: W.ben.id }, { evaluateeId: W.ben.id }] } })
  assert.ok(benSlots.length > 0 && benSlots.every((s) => s.status === 'CANCELLED'))
  const benPrompts = await prisma.weeklyPrompt.findMany({ where: { OR: [{ evaluatorId: W.ben.id }, { evaluateeId: W.ben.id }] } })
  assert.ok(benPrompts.every((p) => p.status === 'CANCELLED'))
  assert.ok(summary.slotsCancelled > 0)
})

test('a late joiner is left out until HR opts them in', WEEKLY_DB_TEST, async () => {
  await prisma.payrollEmployeeProfile.create({ data: { userId: W.ana.id, joiningDate: at(7) } })
  await releaseWeek(cycleId, 7, at(7))
  assert.equal(await prisma.weeklySlot.count({ where: { evaluateeId: W.ana.id, status: { not: 'CANCELLED' } } }), 0)
  await setOptIn(HR_ACTOR, { cycleId, userId: W.ana.id, reason: 'Transferred in' })
  await releaseWeek(cycleId, 8, at(8))
  assert.ok((await prisma.weeklySlot.count({ where: { evaluateeId: W.ana.id, status: 'OPEN' } })) > 0)
})

test('catch-up weeks add one optional comment question per pair and text question', WEEKLY_DB_TEST, async () => {
  const summary = await releaseWeek(cycleId, 12, at(12))
  assert.equal(summary.commentPrompts, 6)
  assert.equal((await releaseWeek(cycleId, 12, at(12))).commentPrompts, 0)
  const comments = await prisma.weeklyPrompt.findMany({ where: { kind: 'COMMENT' } })
  assert.ok(comments.every((c) => c.questionId !== null && c.slotId === null))
})

test('only a running cycle releases, and only within its weeks', WEEKLY_DB_TEST, async () => {
  await assert.rejects(releaseWeek(cycleId, 14, at(14)), isStatus(409))
  await prisma.weeklyCycle.update({ where: { id: cycleId }, data: { status: 'SETUP' } })
  await assert.rejects(releaseWeek(cycleId, 1, at(1)), isStatus(409))
})

test('once answered, the next question about the same person is on a different topic', WEEKLY_DB_TEST, async () => {
  const answer = { situation: 'The client moved the launch forward', action: 'They rebuilt the plan in a day', result: 'We delivered on time' }
  for (let week = 1; week <= 6; week += 1) {
    await releaseWeek(cycleId, week, at(week))
    for (const open of await prisma.weeklyPrompt.findMany({ where: { evaluatorId: W.lead.id, status: 'OPEN' } })) {
      await submitAnswer(weeklyActor(W.lead), { evaluatorId: W.lead.id, actingAs: false }, open.id, answer, at(week))
    }
  }
  const asked = await prisma.weeklyPrompt.findMany({ where: { evaluatorId: W.lead.id } })
  for (const evaluateeId of [W.ana.id, W.ben.id]) {
    const about = asked.filter((p) => p.evaluateeId === evaluateeId)
    assert.ok(about.length >= 2, `asked about ${evaluateeId} ${about.length} times by week 6`)
    assert.equal(new Set(about.map((p) => p.slotId)).size, about.length, 'a new topic each time while topics remain')
  }
})

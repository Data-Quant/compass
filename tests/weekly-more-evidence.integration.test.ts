import test, { after, afterEach, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { WeeklyError } from '../lib/weekly/service/errors'
import { requestMoreEvidence } from '../lib/weekly/service/more-evidence'
import { answerAs, releaseWeekOne } from './helpers/weekly-answers'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const APP = 'https://compass.example'
function mailbox() {
  const sent: Array<{ to: string; subject: string; html: string }> = []
  return { sent, send: async (to: string, subject: string, html: string) => { sent.push({ to, subject, html }) } }
}
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
  process.env.WEEKLY_SEND_EMAILS = 'true'
})
afterEach(() => {
  delete process.env.WEEKLY_SEND_EMAILS
})
after(async () => {
  await prisma.$disconnect()
})

/** The lead's week-1 question and the lead's four topics about the same person. */
async function leadGroup() {
  const prompt = (await releaseWeekOne(cycleId)).find((p) => p.evaluatorId === W.lead.id)!
  const slots = await prisma.weeklySlot.findMany({ where: { cycleId, evaluatorId: W.lead.id, evaluateeId: prompt.evaluateeId }, orderBy: { id: 'asc' } })
  return { prompt, slots }
}

test('asking again reopens closed topics and asks each now, outside the schedule and in a catch-up week', WEEKLY_DB_TEST, async () => {
  const { prompt, slots } = await leadGroup()
  assert.equal(slots.length, 4)
  const others = slots.filter((s) => s.id !== prompt.slotId)
  await prisma.weeklySlot.update({ where: { id: others[0].id }, data: { status: 'CLOSED_NOT_OBSERVED', notObservedCount: 2 } })
  await prisma.weeklySlot.update({ where: { id: others[1].id }, data: { status: 'CLOSED_NOT_OBSERVED', notObservedCount: 2 } })
  await prisma.weeklySlot.update({ where: { id: others[2].id }, data: { snoozedUntilWeek: 20 } })
  const mail = mailbox()
  const result = await requestMoreEvidence(HR_ACTOR, cycleId, { evaluateeId: prompt.evaluateeId, perspective: 'LEAD' }, at(12), mail.send, APP)
  assert.deepEqual([result.reopened, result.prompts, result.evaluators], [2, 3, 1])
  const fresh = await prisma.weeklyPrompt.findMany({ where: { cycleId, evaluatorId: W.lead.id, weekIndex: 12, kind: 'STANDARD' } })
  assert.deepEqual(fresh.map((p) => p.slotId).sort(), others.map((s) => s.id).sort())
  assert.ok(fresh.every((p) => p.status === 'OPEN' && p.releasedAt.getTime() === at(12).getTime()))
  const reopened = await prisma.weeklySlot.findMany({ where: { id: { in: others.map((s) => s.id) } } })
  assert.ok(reopened.every((s) => s.status === 'OPEN' && s.snoozedUntilWeek === null && s.lastAskedWeek === 12))
  assert.deepEqual(mail.sent.map((m) => [m.to, m.subject]), [['wkt-lead@example.test', 'HR asked for more examples: 3 new evaluation questions']])
  assert.equal(await prisma.weeklyAuditEvent.count({ where: { action: 'MORE_EVIDENCE', objectId: prompt.evaluateeId } }), 1)
})

test('asking twice at once gives one question per topic, and a topic whose answer awaits a decision is not asked again', WEEKLY_DB_TEST, async () => {
  const { prompt } = await leadGroup()
  await answerAs(prompt, 'solid') // submitted and waiting to be scored
  const mail = mailbox()
  const ask = () => requestMoreEvidence(HR_ACTOR, cycleId, { evaluateeId: prompt.evaluateeId, perspective: 'LEAD' }, at(3), mail.send, APP)
  const results = await Promise.all([ask(), ask()])
  assert.deepEqual(results.map((r) => r.prompts).sort(), [0, 3])
  const open = await prisma.weeklyPrompt.findMany({ where: { cycleId, evaluatorId: W.lead.id, evaluateeId: prompt.evaluateeId, status: 'OPEN' } })
  assert.equal(open.length, 3)
  assert.equal(new Set(open.map((p) => p.slotId)).size, 3)
  assert.ok(!open.some((p) => p.slotId === prompt.slotId))
  assert.equal(mail.sent.filter((m) => m.to === 'wkt-lead@example.test').length, 1)
})

test('only HR can ask again, and only while the quarter runs', WEEKLY_DB_TEST, async () => {
  const { prompt } = await leadGroup()
  const input = { evaluateeId: prompt.evaluateeId, perspective: 'LEAD' as const }
  await assert.rejects(requestMoreEvidence(weeklyActor(W.lead), cycleId, input, at(3), mailbox().send, APP), isError(403))
  await prisma.weeklyCycle.update({ where: { id: cycleId }, data: { status: 'CLOSED', closedAt: at(13) } })
  await assert.rejects(requestMoreEvidence(HR_ACTOR, cycleId, input, at(13), mailbox().send, APP), isError(409))
})

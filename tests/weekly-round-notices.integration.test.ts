import test, { after, afterEach, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { closeCycle } from '../lib/weekly/service/close'
import { loadStandardBank } from '../lib/weekly/service/content'
import { runWeeklyDailyJob } from '../lib/weekly/service/daily-job'
import { inboxView } from '../lib/weekly/service/inbox'
import { confirmMyLists, requestPeerChange } from '../lib/weekly/service/peer-requests'
import { openRound } from '../lib/weekly/service/round'
import { announceRoundClosed } from '../lib/weekly/service/round-notices'
import { answerAs, scoreAndConfirm } from './helpers/weekly-answers'
import { at, HR_ACTOR, reviewStageCycle, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const APP = 'https://compass.example'
const email = (id: string) => `${id}@example.test`
function mailbox() {
  const sent: Array<{ to: string; subject: string; html: string }> = []
  return { sent, send: async (to: string, subject: string, html: string) => { sent.push({ to, subject, html }) } }
}
const to = (mail: ReturnType<typeof mailbox>, id: string) => mail.sent.filter((m) => m.to === email(id)).map((m) => m.subject)
let periodId = ''

before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  ;({ periodId } = await seedWeeklyBase(prisma))
  process.env.WEEKLY_SEND_EMAILS = 'true'
})
afterEach(() => {
  delete process.env.WEEKLY_SEND_EMAILS
})
after(async () => {
  await prisma.$disconnect()
})

test('2 working days before the review stage ends, people who have not said their lists look right are reminded once', WEEKLY_DB_TEST, async () => {
  const { cycleId } = await reviewStageCycle(periodId)
  // The review stage ends on Friday 2 October.
  await prisma.weeklyCycle.update({ where: { id: cycleId }, data: { reviewDeadline: new Date('2026-10-01T19:00:00.000Z') } })
  await confirmMyLists(weeklyActor(W.ben), at(0, 1))
  const tuesday = mailbox()
  await runWeeklyDailyJob(tuesday.send, APP, at(0, 2))
  assert.equal(tuesday.sent.length, 0, 'three working days left')
  const wednesday = mailbox()
  await runWeeklyDailyJob(wednesday.send, APP, at(0, 3))
  assert.deepEqual(wednesday.sent.map((m) => m.to).sort(), [email(W.ana.id), email(W.lead.id)])
  assert.match(wednesday.sent[0].subject, /^2 days left to check your Q4 2026 \(weekly test\) evaluation lists/)
  assert.match(wednesday.sent[0].html, /2 Oct 2026/)
  const thursday = mailbox()
  await runWeeklyDailyJob(thursday.send, APP, at(0, 4))
  assert.equal(thursday.sent.length, 0, 'once')
})

test('opening the round tells every evaluator how long it runs and when it closes', WEEKLY_DB_TEST, async () => {
  await loadStandardBank(HR_ACTOR)
  await reviewStageCycle(periodId)
  await requestPeerChange(weeklyActor(W.ana), { peerId: W.ben.id, action: 'REMOVE', reasonCode: 'NO_LONGER_WORK_TOGETHER' }, at(0, 2), mailbox().send, APP)
  const mail = mailbox()
  await openRound(HR_ACTOR, periodId, at(1), mail.send, APP)
  assert.deepEqual(to(mail, W.ben.id).filter((s) => /not decided/.test(s)), ['Ana Torvik’s request about you was not decided in time'], 'the peer hears it lapsed')
  const started = mail.sent.filter((m) => /evaluations have started/.test(m.subject))
  assert.deepEqual(started.map((m) => m.to).sort(), [email(W.ana.id), email(W.ben.id), email(W.lead.id)])
  assert.equal(started[0].subject, 'Q4 2026 (weekly test) evaluations have started: 13 weeks, closing 3 Jan 2027')
})

test('questions come on Monday, and only the due day reminds: "due today" on Sunday, nothing in between', WEEKLY_DB_TEST, async () => {
  await startedCycle(periodId)
  await runWeeklyDailyJob(mailbox().send, APP, at(1))
  const [prompt] = (await inboxView(W.lead.id, at(1))).prompts
  await answerAs({ id: prompt.id, evaluatorId: W.lead.id }, 3, at(1, 2))
  for (const day of [2, 3, 4, 5, 6]) {
    const quiet = mailbox()
    await runWeeklyDailyJob(quiet.send, APP, at(1, day))
    assert.equal(quiet.sent.length, 0, `nothing on day ${day}`)
  }
  const sunday = mailbox()
  await runWeeklyDailyJob(sunday.send, APP, at(1, 7))
  assert.deepEqual(sunday.sent.map((m) => m.to).sort(), [email(W.ana.id), email(W.ben.id)])
  assert.equal(sunday.sent[0].subject, 'Your 1 remaining question is due today')
})

test('someone 2 or more weeks behind is told on Wednesday, and so is their lead', WEEKLY_DB_TEST, async () => {
  const { cycleId } = await startedCycle(periodId)
  for (const week of [1, 2, 3]) await runWeeklyDailyJob(mailbox().send, APP, at(week))
  // Ben catches up; Ana still has her week-1 question.
  for (const p of (await inboxView(W.ben.id, at(3))).prompts) await answerAs({ id: p.id, evaluatorId: W.ben.id }, 3, at(3, 2))
  const week2 = mailbox()
  await runWeeklyDailyJob(week2.send, APP, at(2, 3))
  assert.equal(week2.sent.filter((m) => /behind|unanswered/.test(m.subject)).length, 0, 'one week is not behind')
  const wednesday = mailbox()
  await runWeeklyDailyJob(wednesday.send, APP, at(3, 3))
  const open = await prisma.weeklyPrompt.count({ where: { cycleId, evaluatorId: W.ana.id, status: { in: ['OPEN', 'DRAFT'] } } })
  assert.deepEqual(to(wednesday, W.ana.id), [`You have ${open} unanswered evaluation questions`])
  assert.deepEqual(to(wednesday, W.lead.id).filter((s) => /behind/.test(s)), ['1 person on your team is behind on evaluation questions'])
  assert.match(wednesday.sent.find((m) => m.to === email(W.lead.id) && /behind/.test(m.subject))?.html ?? '', /Ana Torvik/)
  assert.deepEqual(to(wednesday, W.ben.id), [])
  const again = mailbox()
  await runWeeklyDailyJob(again.send, APP, at(3, 3, 15))
  assert.equal(again.sent.length, 0, 'once a week')
})

test('HR gets a weekly digest on Monday: answered so far, people behind, answers to review, open requests', WEEKLY_DB_TEST, async () => {
  await startedCycle(periodId)
  await runWeeklyDailyJob(mailbox().send, APP, at(1))
  const [prompt] = (await inboxView(W.lead.id, at(1))).prompts
  await answerAs({ id: prompt.id, evaluatorId: W.lead.id }, 3, at(1, 2))
  const monday = mailbox()
  await runWeeklyDailyJob(monday.send, APP, at(2))
  const digest = monday.sent.find((m) => m.to === email(W.hr.id) && /week 2 of 13/.test(m.subject))
  assert.ok(digest, 'HR digest sent')
  assert.match(digest.subject, /^Q4 2026 \(weekly test\) evaluations, week 2 of 13: 33% answered/)
  assert.match(digest.html, /waiting for your review/)
  assert.equal(monday.sent.filter((m) => m.to === email(W.ana.id) && /week 2 of 13/.test(m.subject)).length, 0, 'HR only')
  const later = mailbox()
  await runWeeklyDailyJob(later.send, APP, at(2, 1, 15))
  assert.equal(later.sent.filter((m) => /week 2 of 13/.test(m.subject)).length, 0, 'once a week')
})

test('a late joiner’s lead is told they are not in the round, and reminded to give feedback 2 weeks before it closes', WEEKLY_DB_TEST, async () => {
  await startedCycle(periodId)
  // Ben joins in week 8: fewer than 6 question weeks are left.
  await prisma.payrollEmployeeProfile.create({ data: { userId: W.ben.id, joiningDate: at(8) } })
  const week8 = mailbox()
  await runWeeklyDailyJob(week8.send, APP, at(8, 2))
  assert.deepEqual(to(week8, W.lead.id).filter((s) => /Ben/.test(s)), ['Ben Okafor isn’t in the Q4 2026 (weekly test) evaluations'])
  assert.match(week8.sent.find((m) => /isn’t in/.test(m.subject))?.html ?? '', /feedback in person/)
  const nextDay = mailbox()
  await runWeeklyDailyJob(nextDay.send, APP, at(8, 3))
  assert.equal(nextDay.sent.filter((m) => /Ben/.test(m.subject)).length, 0, 'once')
  const week12 = mailbox()
  await runWeeklyDailyJob(week12.send, APP, at(12, 2))
  assert.deepEqual(to(week12, W.lead.id).filter((s) => /Ben/.test(s)), ['Reminder: feedback for Ben Okafor'])
})

test('the final week tells anyone with unanswered questions how many are left before the round closes', WEEKLY_DB_TEST, async () => {
  const { cycleId } = await startedCycle(periodId)
  await runWeeklyDailyJob(mailbox().send, APP, at(1))
  const monday = mailbox()
  await runWeeklyDailyJob(monday.send, APP, at(13))
  // Everything still open, including the final week's own questions.
  const open = await prisma.weeklyPrompt.count({ where: { cycleId, evaluatorId: W.ana.id, status: { in: ['OPEN', 'DRAFT'] } } })
  const subject = `${open} question${open === 1 ? '' : 's'} left before 3 Jan 2027`
  assert.deepEqual(to(monday, W.ana.id).filter((s) => /left before/.test(s)), [subject])
  assert.equal(to(monday, W.ana.id).filter((s) => s === 'Your evaluation questions for this week').length, 0, 'instead of the questions email')
})

test('closing the round tells every evaluator, once', WEEKLY_DB_TEST, async () => {
  const { cycleId } = await startedCycle(periodId)
  await runWeeklyDailyJob(mailbox().send, APP, at(1))
  for (const id of [W.lead.id, W.ana.id, W.ben.id]) {
    for (const p of (await inboxView(id, at(1))).prompts) await answerAs({ id: p.id, evaluatorId: id }, 3, at(1, 2))
  }
  await scoreAndConfirm(cycleId)
  await closeCycle(HR_ACTOR, cycleId, { drops: [], formsAcknowledged: true }, at(14))
  const mail = mailbox()
  await announceRoundClosed(cycleId, mail.send, APP)
  await announceRoundClosed(cycleId, mail.send, APP)
  assert.deepEqual(mail.sent.map((m) => m.to).sort(), [email(W.ana.id), email(W.ben.id), email(W.lead.id)])
  assert.equal(mail.sent[0].subject, 'Q4 2026 (weekly test) evaluations are closed')
})

test('a weekly email missed on its day goes out later that week: the digest on Tuesday, "behind" on Thursday', WEEKLY_DB_TEST, async () => {
  await startedCycle(periodId)
  for (const week of [1, 2]) await runWeeklyDailyJob(mailbox().send, APP, at(week))
  const failing = async () => { throw new Error('SMTP unavailable') }
  await runWeeklyDailyJob(failing, APP, at(3))
  const tuesday = mailbox()
  await runWeeklyDailyJob(tuesday.send, APP, at(3, 2))
  assert.equal(to(tuesday, W.hr.id).filter((s) => /week 3 of 13/.test(s)).length, 1, 'the digest is retried')
  const thursday = mailbox()
  await runWeeklyDailyJob(thursday.send, APP, at(3, 4))
  assert.ok(to(thursday, W.ana.id).some((s) => /unanswered/.test(s)), 'a missed Wednesday run is caught up')
  const friday = mailbox()
  await runWeeklyDailyJob(friday.send, APP, at(3, 5))
  assert.equal(to(friday, W.ana.id).filter((s) => /unanswered/.test(s)).length, 0, 'once a week')
})

test('"started" and "closed" emails that failed are sent by the next daily run', WEEKLY_DB_TEST, async () => {
  await loadStandardBank(HR_ACTOR)
  await reviewStageCycle(periodId)
  await openRound(HR_ACTOR, periodId, at(1), async () => { throw new Error('SMTP unavailable') }, APP)
  assert.equal(await prisma.weeklyAuditEvent.count({ where: { action: 'ROUND_OPEN' } }), 1, 'the open is recorded even when emails fail')
  const next = mailbox()
  await runWeeklyDailyJob(next.send, APP, at(1, 2))
  assert.equal(next.sent.filter((m) => /have started/.test(m.subject)).length, 3)
  const cycle = await prisma.weeklyCycle.findUniqueOrThrow({ where: { periodId } })
  await prisma.weeklyPrompt.updateMany({ where: { cycleId: cycle.id }, data: { status: 'EXPIRED' } })
  await prisma.weeklyCycle.update({ where: { id: cycle.id }, data: { status: 'CLOSED', closedAt: at(14) } })
  const after = mailbox()
  await runWeeklyDailyJob(after.send, APP, at(14, 2))
  assert.equal(after.sent.filter((m) => /are closed/.test(m.subject)).length, 3)
  const later = mailbox()
  await runWeeklyDailyJob(later.send, APP, at(16, 2))
  assert.equal(later.sent.length, 0)
})

test('someone whose questions were all cancelled is not told the round closed', WEEKLY_DB_TEST, async () => {
  const { cycleId } = await startedCycle(periodId)
  await runWeeklyDailyJob(mailbox().send, APP, at(1))
  await prisma.weeklyPrompt.updateMany({ where: { cycleId, evaluatorId: W.ben.id }, data: { status: 'CANCELLED' } })
  await prisma.weeklyPrompt.updateMany({ where: { cycleId, evaluatorId: { not: W.ben.id } }, data: { status: 'EXPIRED' } })
  await prisma.weeklyCycle.update({ where: { id: cycleId }, data: { status: 'CLOSED', closedAt: at(14) } })
  const mail = mailbox()
  await announceRoundClosed(cycleId, mail.send, APP)
  assert.deepEqual(mail.sent.map((m) => m.to).sort(), [email(W.ana.id), email(W.lead.id)])
})

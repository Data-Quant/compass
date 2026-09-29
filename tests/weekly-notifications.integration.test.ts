import test, { after, afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { runWeeklyDailyJob } from '../lib/weekly/service/daily-job'
import { inboxView, submitAnswer } from '../lib/weekly/service/inbox'
import { at, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const APP = 'https://compass.example'
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')

function mailbox() {
  const sent: Array<{ to: string; subject: string; html: string }> = []
  return { sent, send: async (to: string, subject: string, html: string) => { sent.push({ to, subject, html }) } }
}

beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  const { periodId } = await seedWeeklyBase(prisma)
  await startedCycle(periodId)
})
afterEach(() => {
  delete process.env.WEEKLY_SEND_EMAILS
})
after(async () => {
  await prisma.$disconnect()
})

test('Monday releases the week and emails each evaluator once', WEEKLY_DB_TEST, async () => {
  process.env.WEEKLY_SEND_EMAILS = 'true'
  const mail = mailbox()
  const monday = await runWeeklyDailyJob(mail.send, APP, at(1))
  assert.equal(monday.released?.promptsCreated, 3)
  assert.deepEqual(mail.sent.map((m) => m.to).sort(), ['wkt-ana@example.test', 'wkt-ben@example.test', 'wkt-lead@example.test'])
  assert.equal(mail.sent[0].subject, 'Your evaluation questions for this week')
  const again = await runWeeklyDailyJob(mail.send, APP, at(1, 1, 15))
  assert.equal(mail.sent.length, 3)
  assert.equal(again.emails?.skipped, 3)
})

test('with emails off, notifications are recorded and nothing is sent', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  const result = await runWeeklyDailyJob(mail.send, APP, at(1))
  assert.equal(mail.sent.length, 0)
  assert.equal(result.emails?.recorded, 3)
  assert.equal(await prisma.weeklyNotification.count({ where: { delivered: false } }), 3)
})

test('Thursday reminds only people with open questions; other weekdays do nothing', WEEKLY_DB_TEST, async () => {
  process.env.WEEKLY_SEND_EMAILS = 'true'
  await runWeeklyDailyJob(mailbox().send, APP, at(1))
  const [prompt] = (await inboxView(W.lead.id, at(1))).prompts
  const answer = { situation: `The client moved the launch ${words(10)}`, action: `They rebuilt the plan ${words(15)}`, result: `We delivered on time ${words(15)}` }
  await submitAnswer(weeklyActor(W.lead), { evaluatorId: W.lead.id, actingAs: false }, prompt.id, answer, at(1, 2))
  const mail = mailbox()
  await runWeeklyDailyJob(mail.send, APP, at(1, 4))
  assert.deepEqual(mail.sent.map((m) => m.to).sort(), ['wkt-ana@example.test', 'wkt-ben@example.test'])
  assert.equal(mail.sent[0].subject, 'Reminder: 1 evaluation question is waiting')
  const tuesday = await runWeeklyDailyJob(mailbox().send, APP, at(1, 2))
  assert.deepEqual([tuesday.released, tuesday.emails], [null, null])
})

test('a failed email is retried on the next run', WEEKLY_DB_TEST, async () => {
  process.env.WEEKLY_SEND_EMAILS = 'true'
  const failing = async () => {
    throw new Error('SMTP unavailable')
  }
  assert.equal((await runWeeklyDailyJob(failing, APP, at(1))).emails?.failed, 3)
  assert.equal(await prisma.weeklyNotification.count(), 0)
  assert.equal((await runWeeklyDailyJob(mailbox().send, APP, at(1, 1, 15))).emails?.sent, 3)
})

test('names with HTML are escaped in the email', WEEKLY_DB_TEST, async () => {
  process.env.WEEKLY_SEND_EMAILS = 'true'
  await prisma.user.update({ where: { id: W.ana.id }, data: { name: '<b>Ana</b>' } })
  const mail = mailbox()
  await runWeeklyDailyJob(mail.send, APP, at(1))
  const html = mail.sent.find((m) => m.to === 'wkt-ana@example.test')?.html ?? ''
  assert.doesNotMatch(html, /<b>Ana<\/b>/)
  assert.match(html, /&lt;b&gt;Ana&lt;\/b&gt;/)
})

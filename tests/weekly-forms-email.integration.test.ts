import test, { after, afterEach, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { fakeModel } from '../lib/weekly/ai/model'
import { runWeeklyDailyJob } from '../lib/weekly/service/daily-job'
import { seedFormFixtures } from './helpers/weekly-form-fixtures'
import { at, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, WEEKLY_DB_READY, WEEKLY_DB_TEST } from './helpers/weekly-test-db'

const APP = 'https://compass.example'
function mailbox() {
  const sent: Array<{ to: string; subject: string; html: string }> = []
  return { sent, send: async (to: string, subject: string, html: string) => { sent.push({ to, subject, html }) } }
}
const formsEmails = (mail: ReturnType<typeof mailbox>) => mail.sent.filter((m) => /forms are open/.test(m.subject)).map((m) => m.to).sort()

before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  const { periodId } = await seedWeeklyBase(prisma)
  await seedFormFixtures(prisma)
  await startedCycle(periodId)
  process.env.WEEKLY_SEND_EMAILS = 'true'
})
afterEach(() => {
  delete process.env.WEEKLY_SEND_EMAILS
})
after(async () => {
  await prisma.$disconnect()
})

test('once the forms open, each form evaluator with a form to fill is emailed once a day', WEEKLY_DB_TEST, async () => {
  const before = mailbox()
  await runWeeklyDailyJob(before.send, APP, at(11), { model: fakeModel() })
  assert.deepEqual(formsEmails(before), [])
  const opening = mailbox()
  await runWeeklyDailyJob(opening.send, APP, at(12), { model: fakeModel() })
  assert.deepEqual(formsEmails(opening), ['wkt-chief@example.test', 'wkt-hr2@example.test', 'wkt-hr@example.test'])
  const again = mailbox()
  await runWeeklyDailyJob(again.send, APP, at(12, 1, 15), { model: fakeModel() })
  assert.deepEqual(formsEmails(again), [], 'once a day')
  const nextDay = mailbox()
  await runWeeklyDailyJob(nextDay.send, APP, at(12, 2), { model: fakeModel() })
  assert.deepEqual(formsEmails(nextDay), ['wkt-chief@example.test', 'wkt-hr2@example.test', 'wkt-hr@example.test'])
})

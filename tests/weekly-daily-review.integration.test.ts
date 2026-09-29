import test, { after, afterEach, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { fakeModel } from '../lib/weekly/ai/model'
import { isSampled } from '../lib/weekly/review-rules'
import { runWeeklyDailyJob } from '../lib/weekly/service/daily-job'
import { WeeklyError } from '../lib/weekly/service/errors'
import { acceptDueNow, scoreNow } from '../lib/weekly/service/test-tools'
import { answerAs, releaseWeekOne } from './helpers/weekly-answers'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST } from './helpers/weekly-test-db'

const APP = 'https://compass.example'
const HOUR = 60 * 60 * 1000
function mailbox() {
  const sent: Array<{ to: string; subject: string; html: string }> = []
  return { sent, send: async (to: string, subject: string, html: string) => { sent.push({ to, subject, html }) } }
}
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
  delete process.env.WEEKLY_TEST_TOOLS
})
after(async () => {
  await prisma.$disconnect()
})

test('each day the job scores waiting answers and accepts those scored more than 72 hours ago', WEEKLY_DB_TEST, async () => {
  const prompts = new Map((await releaseWeekOne(cycleId)).map((p) => [p.evaluatorId, p]))
  const lead = await answerAs(prompts.get(W.lead.id)!, 'solid')
  const wednesday = await runWeeklyDailyJob(mailbox().send, APP, at(1, 3), { model: fakeModel() })
  assert.equal(wednesday.scoring?.scored, 1)
  assert.equal(wednesday.autoAccepted, 0)
  const saturday = await runWeeklyDailyJob(mailbox().send, APP, new Date(at(1, 3).getTime() + 73 * HOUR), { model: fakeModel() })
  assert.equal(saturday.autoAccepted, isSampled(lead) ? 0 : 1)
})

test('evaluators get one follow-up email a day and HR hears about answers the AI could not score', WEEKLY_DB_TEST, async () => {
  const prompts = new Map((await releaseWeekOne(cycleId)).map((p) => [p.evaluatorId, p]))
  await answerAs(prompts.get(W.ana.id)!, 'praise')
  const mail = mailbox()
  await runWeeklyDailyJob(mail.send, APP, at(1, 3), { model: fakeModel() })
  assert.ok(mail.sent.some((m) => m.to === 'wkt-ana@example.test' && m.subject === 'Please add detail to 1 evaluation answer'))
  await answerAs(prompts.get(W.ben.id)!, 'solid')
  const later = mailbox()
  await runWeeklyDailyJob(later.send, APP, at(1, 3, 15), { model: null })
  assert.ok(later.sent.some((m) => m.to === 'wkt-hr@example.test' && m.subject === '1 weekly answer could not be scored'))
  assert.ok(!later.sent.some((m) => m.to === 'wkt-ana@example.test'), 'the follow-up email is sent once a day')
})

test('in week 10 HR gets the low-evidence list, once', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  await runWeeklyDailyJob(mail.send, APP, at(10), { model: fakeModel() })
  const list = mail.sent.filter((m) => m.to === 'wkt-hr@example.test' && /low evidence/.test(m.subject))
  assert.equal(list.length, 1)
  assert.match(list[0].html, /Layla Mercer/)
  const again = mailbox()
  await runWeeklyDailyJob(again.send, APP, at(10, 2), { model: fakeModel() })
  assert.ok(!again.sent.some((m) => /low evidence/.test(m.subject)))
})

test('preview tools: score now with the stand-in model, then accept everything due at once', WEEKLY_DB_TEST, async () => {
  const prompts = await releaseWeekOne(cycleId)
  const ids = []
  for (const prompt of prompts) ids.push(await answerAs(prompt, 'solid'))
  await assert.rejects(scoreNow(HR_ACTOR, cycleId, 'stand-in'), (e: unknown) => e instanceof WeeklyError && e.status === 404)
  process.env.WEEKLY_TEST_TOOLS = 'true'
  const scored = await scoreNow(HR_ACTOR, cycleId, 'stand-in')
  assert.deepEqual([scored.scored, scored.remaining], [prompts.length, 0])
  const accepted = await acceptDueNow(HR_ACTOR, cycleId, new Date())
  assert.equal(accepted.accepted, ids.filter((id) => !isSampled(id)).length)
  assert.equal(await prisma.weeklyAuditEvent.count({ where: { action: { in: ['TEST_SCORE_NOW', 'TEST_ACCEPT_DUE'] } } }), 2)
})

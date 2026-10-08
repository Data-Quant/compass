import test, { after, afterEach, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { WeeklyError } from '../lib/weekly/service/errors'
import {
  adminSelfReviews, markSelfReviewRead, mySelfReview, remindUnreadSelfReviews, replyToSelfReview, selfReviewReleaseWeeks, submitSelfReview, teamSelfReviews,
} from '../lib/weekly/service/self-review'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const APP = 'https://compass.example'
const isStatus = (status: number, pattern?: RegExp) => (e: unknown) => e instanceof WeeklyError && e.status === status && (!pattern || pattern.test(e.message))
function mailbox() {
  const sent: Array<{ to: string; subject: string; html: string }> = []
  return { sent, send: async (to: string, subject: string, html: string) => { sent.push({ to, subject, html }) } }
}
const email = (id: string) => `${id}@example.test`
const words = (n: number, word = 'delivered') => Array.from({ length: n }, () => word).join(' ')
const FULL = [words(12), words(10), words(10)]
const ana = weeklyActor(W.ana)
let periodId = ''

before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  ;({ periodId } = await seedWeeklyBase(prisma))
  await startedCycle(periodId)
  process.env.WEEKLY_SEND_EMAILS = 'true'
})
afterEach(() => {
  delete process.env.WEEKLY_SEND_EMAILS
})
after(async () => {
  await prisma.$disconnect()
})

test('the question comes in the last week of each month of the quarter', () => {
  // Week 1 starts Monday 5 October; 13 weeks; the last weeks starting in October, November and December.
  assert.deepEqual(selfReviewReleaseWeeks(new Date('2026-10-04T19:00:00.000Z'), 13, new Date('2026-10-01T00:00:00.000Z')), [4, 9, 13])
})

test('in the month’s last week everyone gets that month’s question, saying who it goes to; nothing before', WEEKLY_DB_TEST, async () => {
  assert.equal((await mySelfReview(ana, at(3))).current, null)
  const view = await mySelfReview(ana, at(4))
  assert.deepEqual([view.current?.month, view.current?.title, view.current?.parts.length, view.current?.discussOption], [1, 'What you delivered', 3, true])
  assert.deepEqual(view.current?.recipients.map((p) => p.id), [W.lead.id])
  assert.equal((await mySelfReview(weeklyActor(W.cara), at(4))).current?.recipients.length, 0, 'no lead: HR only')
})

test('it needs 30 words across the three boxes, goes to the lead and HR at once, and cannot be changed', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  await assert.rejects(submitSelfReview(ana, { month: 1, answers: [words(10), words(5), words(5)], wantsDiscussion: false }, at(4), mail.send, APP), isStatus(400, /30 words/))
  const sent = await submitSelfReview(ana, { month: 1, answers: FULL, wantsDiscussion: true }, at(4, 2), mail.send, APP)
  assert.deepEqual(sent.recipients.map((p) => p.id), [W.lead.id])
  assert.deepEqual(mail.sent.map((m) => m.to), [email(W.lead.id)])
  assert.match(mail.sent[0].subject, new RegExp(`${W.ana.name} has submitted their self-evaluation`))
  await assert.rejects(submitSelfReview(ana, { month: 1, answers: FULL, wantsDiscussion: false }, at(4, 3), mail.send, APP), isStatus(409))
  const view = await mySelfReview(ana, at(4, 3))
  assert.equal(view.current, null)
  assert.deepEqual([view.history[0].month, view.history[0].answers, view.history[0].wantsDiscussion], [1, FULL, true])
})

test('a missed question carries over until next month’s question replaces it', WEEKLY_DB_TEST, async () => {
  assert.equal((await mySelfReview(ana, at(6))).current?.month, 1, 'still open in week 6')
  assert.equal((await mySelfReview(ana, at(9))).current?.month, 2, 'replaced in week 9')
  await assert.rejects(submitSelfReview(ana, { month: 1, answers: FULL, wantsDiscussion: false }, at(9), mailbox().send, APP), isStatus(409))
})

test('the lead reads it, marks it read and replies; the person sees the reply; nobody else can see it', WEEKLY_DB_TEST, async () => {
  await submitSelfReview(ana, { month: 1, answers: FULL, wantsDiscussion: false }, at(4), mailbox().send, APP)
  const lead = weeklyActor(W.lead)
  const [item] = (await teamSelfReviews(lead)).items
  assert.deepEqual([item.person.id, item.readAt, item.answers], [W.ana.id, null, FULL])
  assert.deepEqual((await teamSelfReviews(weeklyActor(W.ben))).items, [], 'a peer never sees it')
  await assert.rejects(markSelfReviewRead(weeklyActor(W.ben), item.id, at(4, 2)), isStatus(404))
  await markSelfReviewRead(lead, item.id, at(4, 2))
  const mail = mailbox()
  await replyToSelfReview(lead, item.id, 'Good list. Let us talk about the missed handover.', at(4, 3), mail.send, APP)
  assert.deepEqual(mail.sent.map((m) => m.to), [email(W.ana.id)])
  const reply = (await mySelfReview(ana, at(5))).history[0].reads[0]
  assert.deepEqual([reply.lead.id, Boolean(reply.readAt), reply.reply], [W.lead.id, true, 'Good list. Let us talk about the missed handover.'])
})

test('HR sees every submission by month and department, with whether each lead has read it; unread after 5 working days is reminded once and flagged', WEEKLY_DB_TEST, async () => {
  await submitSelfReview(ana, { month: 1, answers: FULL, wantsDiscussion: false }, at(4, 1), mailbox().send, APP)
  await submitSelfReview(weeklyActor(W.cara), { month: 1, answers: FULL, wantsDiscussion: false }, at(4, 1), mailbox().send, APP)
  await assert.rejects(adminSelfReviews(ana, periodId, {}), isStatus(403))
  const all = await adminSelfReviews(HR_ACTOR, periodId, {}, at(5))
  assert.deepEqual(all.rows.map((r) => r.person.id).sort(), [W.ana.id, W.cara.id].sort())
  assert.deepEqual(all.rows.find((r) => r.person.id === W.cara.id)?.reads, [], 'Cara has no lead: HR only')
  assert.deepEqual((await adminSelfReviews(HR_ACTOR, periodId, { department: 'Design' })).rows.map((r) => r.person.id), [W.cara.id])
  assert.equal((await adminSelfReviews(HR_ACTOR, periodId, { month: 2 })).rows.length, 0)
  assert.ok(all.missing.some((p) => p.id === W.ben.id), 'HR sees who has not submitted')
  const early = mailbox()
  assert.equal((await remindUnreadSelfReviews(at(5, 1), early.send, APP)).sent, 0, 'not yet 5 working days')
  const due = mailbox()
  assert.equal((await remindUnreadSelfReviews(at(5, 2), due.send, APP)).sent, 1)
  assert.deepEqual(due.sent.map((m) => m.to), [email(W.lead.id)])
  assert.equal((await remindUnreadSelfReviews(at(6, 1), mailbox().send, APP)).sent, 0, 'once')
  assert.equal((await adminSelfReviews(HR_ACTOR, periodId, {})).rows.find((r) => r.person.id === W.ana.id)?.reads[0].overdue, true)
})

test('HR-filled partners get no self-evaluation question', WEEKLY_DB_TEST, async () => {
  process.env.WEEKLY_HR_FILLED_PARTNERS = W.ana.name
  try {
    assert.equal((await mySelfReview(ana, at(4))).current, null)
  } finally {
    delete process.env.WEEKLY_HR_FILLED_PARTNERS
  }
})

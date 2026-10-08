import test, { after, afterEach, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { getResolvedEvaluationAssignments } from '../lib/evaluation-assignments'
import { WeeklyError } from '../lib/weekly/service/errors'
import {
  adminPeerRequests, answerPeerRequest, cancelPeerRequest, confirmMyLists, decidePeerRequest, myMapping, peerRequestByToken, remindStaleMappingRequests,
  replyToPeerRequest, requestPeerChange, resendPeerRequestLinks, sendMappingEmails, voteOnPeerRequest,
} from '../lib/weekly/service/peer-requests'
import { at, HR_ACTOR, reviewStageCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const APP = 'https://compass.example'
const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
function mailbox() {
  const sent: Array<{ to: string; subject: string; html: string }> = []
  return { sent, send: async (to: string, subject: string, html: string) => { sent.push({ to, subject, html }) } }
}
/** The one-click link in the email to `to`. */
const tokenFor = (mail: ReturnType<typeof mailbox>, to: string) => {
  const html = [...mail.sent].reverse().find((m) => m.to === to)?.html ?? ''
  const match = html.match(/\/peer-requests\/([A-Za-z0-9_-]+)/)
  assert.ok(match, `no link in the email to ${to}`)
  return match[1]
}
const email = (id: string) => `${id}@example.test`
const ana = weeklyActor(W.ana)
const removeBen = { peerId: W.ben.id, action: 'REMOVE' as const, reasonCode: 'NO_LONGER_WORK_TOGETHER' as const }
let periodId = ''

before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  ;({ periodId } = await seedWeeklyBase(prisma))
  await reviewStageCycle(periodId)
  process.env.WEEKLY_SEND_EMAILS = 'true'
})
afterEach(() => {
  delete process.env.WEEKLY_SEND_EMAILS
})
after(async () => {
  await prisma.$disconnect()
})

const peerPairs = async () => (await getResolvedEvaluationAssignments(periodId)).filter((a) => a.relationshipType === 'PEER').map((a) => `${a.evaluatorId}>${a.evaluateeId}`).sort()

test('everyone sees their lead, their team and their peers for the quarter', WEEKLY_DB_TEST, async () => {
  const mine = await myMapping(ana, at(1))
  assert.deepEqual([mine.leads.map((p) => p.id), mine.reports.map((p) => p.id), mine.peers.map((p) => p.id)], [[W.lead.id], [], [W.ben.id]])
  const lead = await myMapping(weeklyActor(W.lead), at(1))
  assert.deepEqual(lead.reports.map((p) => p.id).sort(), [W.ana.id, W.ben.id].sort())
})

test('the lead alone approves a peer change; the peer is only told', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  const request = await requestPeerChange(ana, { ...removeBen, reason: 'Ben moved to another project' }, at(1), mail.send, APP)
  assert.deepEqual([request.status, request.reasonCode], ['PENDING', 'NO_LONGER_WORK_TOGETHER'])
  assert.deepEqual(mail.sent.map((m) => m.to).sort(), [email(W.ben.id), email(W.lead.id)].sort())
  const toBen = mail.sent.find((m) => m.to === email(W.ben.id))!
  assert.doesNotMatch(toBen.html, /approve/i, 'the peer is not asked to approve')

  const view = await peerRequestByToken(tokenFor(mail, email(W.lead.id)))
  assert.deepEqual([view.requester.name, view.peer.name, view.action, view.role, view.status], [W.ana.name, W.ben.name, 'REMOVE', 'LEAD', 'PENDING'])
  assert.equal(view.peersLeft, 0, 'the lead sees Ana would be left with no peers')
  const done = mailbox()
  assert.equal((await voteOnPeerRequest(tokenFor(mail, email(W.lead.id)), 'APPROVE', null, at(1, 2), done.send, APP)).status, 'APPROVED')
  assert.deepEqual(await peerPairs(), [], 'both directions are removed')
  assert.deepEqual(done.sent.map((m) => m.to), [email(W.ana.id)], 'the requester hears the outcome')
})

test('the peer can say whether they work together; it is shown to the lead and HR and blocks nothing', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  const request = await requestPeerChange(ana, { peerId: W.cara.id, action: 'ADD' }, at(1), mail.send, APP)
  const caraToken = tokenFor(mail, email(W.cara.id))
  assert.equal((await peerRequestByToken(caraToken)).role, 'PEER')
  await assert.rejects(voteOnPeerRequest(caraToken, 'APPROVE', null, at(1, 2), mailbox().send, APP), isStatus(403))
  await replyToPeerRequest(caraToken, 'NOT_WORK_TOGETHER', at(1, 2))
  assert.equal((await peerRequestByToken(tokenFor(mail, email(W.lead.id)))).peerReply, 'NOT_WORK_TOGETHER')
  assert.equal((await adminPeerRequests(HR_ACTOR)).requests.find((r) => r.id === request.id)?.peerReply, 'NOT_WORK_TOGETHER')
  // The peer may change their mind; it still blocks nothing.
  await replyToPeerRequest(caraToken, 'WORK_TOGETHER', at(1, 3))
  assert.equal((await voteOnPeerRequest(tokenFor(mail, email(W.lead.id)), 'APPROVE', null, at(1, 3), mailbox().send, APP)).status, 'APPROVED')
  assert.deepEqual((await myMapping(ana, at(2))).peers.map((p) => p.id).sort(), [W.ben.id, W.cara.id].sort())
})

test('a lead who declines gives a reason, and the requester sees it', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  await requestPeerChange(ana, removeBen, at(1), mail.send, APP)
  const lead = tokenFor(mail, email(W.lead.id))
  await assert.rejects(voteOnPeerRequest(lead, 'REJECT', '  ', at(1, 2), mailbox().send, APP), /reason/)
  assert.equal((await voteOnPeerRequest(lead, 'REJECT', 'Ana and Ben still review each other’s work', at(1, 2), mailbox().send, APP)).status, 'REJECTED')
  assert.equal((await peerPairs()).length, 2)
  const [mine] = (await myMapping(ana, at(2))).requests
  assert.deepEqual([mine.status, mine.decisionNote], ['REJECTED', 'Ana and Ben still review each other’s work'])
  await assert.rejects(voteOnPeerRequest(lead, 'APPROVE', null, at(1, 3), mailbox().send, APP), isStatus(409))
})

test('removing a peer needs a reason, and "Other" needs words', WEEKLY_DB_TEST, async () => {
  const send = mailbox().send
  await assert.rejects(requestPeerChange(ana, { peerId: W.ben.id, action: 'REMOVE' }, at(1), send, APP), /reason/)
  await assert.rejects(requestPeerChange(ana, { peerId: W.ben.id, action: 'REMOVE', reasonCode: 'OTHER', reason: ' ' }, at(1), send, APP), /reason/)
  const ok = await requestPeerChange(ana, { peerId: W.ben.id, action: 'REMOVE', reasonCode: 'OTHER', reason: 'Different time zones' }, at(1), send, APP)
  assert.deepEqual([ok.reasonCode, ok.reason], ['OTHER', 'Different time zones'])
})

test('with no lead to approve, HR decides; HR can also decide any request', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  const request = await requestPeerChange(weeklyActor(W.cara), { peerId: W.ana.id, action: 'ADD' }, at(1), mail.send, APP)
  assert.deepEqual(mail.sent.map((m) => m.to), [email(W.ana.id)], 'only the peer is told')
  assert.equal(request.approver, null)
  await assert.rejects(decidePeerRequest(ana, request.id, 'APPROVE', null, at(1, 3), mailbox().send, APP), isStatus(403))
  assert.equal((await decidePeerRequest(HR_ACTOR, request.id, 'APPROVE', null, at(1, 3), mailbox().send, APP)).status, 'APPROVED')
  assert.ok((await peerPairs()).includes(`${W.cara.id}>${W.ana.id}`))
})

test('requests must make sense: no duplicates, no removing a non-peer, no adding a peer twice or yourself; the requester can cancel', WEEKLY_DB_TEST, async () => {
  const send = mailbox().send
  const request = await requestPeerChange(ana, removeBen, at(1), send, APP)
  await assert.rejects(requestPeerChange(ana, removeBen, at(1), send, APP), isStatus(409))
  await assert.rejects(requestPeerChange(ana, { ...removeBen, peerId: W.cara.id }, at(1), send, APP), /not one of your peers/)
  await assert.rejects(requestPeerChange(ana, { peerId: W.ben.id, action: 'ADD' }, at(1), send, APP), /already/)
  await assert.rejects(requestPeerChange(ana, { peerId: W.ana.id, action: 'ADD' }, at(1), send, APP), /yourself/)
  await assert.rejects(cancelPeerRequest(weeklyActor(W.ben), request.id), isStatus(404))
  await cancelPeerRequest(ana, request.id)
  assert.equal((await prisma.peerChangeRequest.findUniqueOrThrow({ where: { id: request.id } })).status, 'CANCELLED')
  await prisma.evaluationPeriod.update({ where: { id: periodId }, data: { isLocked: true } })
  await assert.rejects(requestPeerChange(ana, removeBen, at(1), send, APP), /locked/)
})

test('HR emails everyone their mapping for the quarter, with a link to check it', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  await assert.rejects(sendMappingEmails(ana, at(1), mail.send, APP), isStatus(403))
  const result = await sendMappingEmails(HR_ACTOR, at(1), mail.send, APP)
  assert.ok(result.sent >= 3)
  const toLead = mail.sent.find((m) => m.to === email(W.lead.id))!
  assert.match(toLead.html, new RegExp(W.ana.name))
  assert.match(toLead.html, /\/evaluations\/weekly/)
  const toAna = mail.sent.find((m) => m.to === email(W.ana.id))!
  assert.match(toAna.html, new RegExp(W.lead.name))
  assert.match(toAna.html, new RegExp(W.ben.name))
  assert.match(toAna.html, /your lead approves/)
})

test('a link stops working once HR locks the quarter', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  await requestPeerChange(ana, removeBen, at(1), mail.send, APP)
  await prisma.evaluationPeriod.update({ where: { id: periodId }, data: { isLocked: true } })
  await assert.rejects(voteOnPeerRequest(tokenFor(mail, email(W.lead.id)), 'APPROVE', null, at(2), mailbox().send, APP), /locked/)
  await assert.rejects(replyToPeerRequest(tokenFor(mail, email(W.ben.id)), 'WORK_TOGETHER', at(2)), /locked/)
})

test('a lead approval and an HR decision at the same moment make the change once', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  const request = await requestPeerChange(ana, removeBen, at(1), mail.send, APP)
  const results = await Promise.allSettled([
    voteOnPeerRequest(tokenFor(mail, email(W.lead.id)), 'APPROVE', null, at(1, 2), mailbox().send, APP),
    decidePeerRequest(HR_ACTOR, request.id, 'APPROVE', null, at(1, 2), mailbox().send, APP),
  ])
  assert.ok(results.some((r) => r.status === 'fulfilled' && r.value.status === 'APPROVED'))
  assert.deepEqual(await peerPairs(), [])
  assert.equal(await prisma.evaluationPeriodAssignmentOverride.count(), 2)
})

test('HR can send fresh links; the old ones stop working', WEEKLY_DB_TEST, async () => {
  const first = mailbox()
  const request = await requestPeerChange(ana, removeBen, at(1), first.send, APP)
  const again = mailbox()
  await assert.rejects(resendPeerRequestLinks(ana, request.id, at(2), again.send, APP), isStatus(403))
  await resendPeerRequestLinks(HR_ACTOR, request.id, at(2), again.send, APP)
  assert.deepEqual(again.sent.map((m) => m.to).sort(), [email(W.ben.id), email(W.lead.id)].sort())
  await assert.rejects(peerRequestByToken(tokenFor(first, email(W.lead.id))), isStatus(404))
  assert.equal((await peerRequestByToken(tokenFor(again, email(W.lead.id)))).status, 'PENDING')
})

test('the people offered as a new peer leave out the lead, the team and anyone already asked about', WEEKLY_DB_TEST, async () => {
  await requestPeerChange(ana, { peerId: W.cara.id, action: 'ADD' }, at(1), mailbox().send, APP)
  const ids = (await myMapping(ana, at(1))).candidates.map((c) => c.id)
  assert.ok(!ids.includes(W.lead.id) && !ids.includes(W.ben.id) && !ids.includes(W.cara.id) && !ids.includes(W.ana.id))
})

test('starting pre-evaluation for a quarter emails everyone that quarter’s mapping', WEEKLY_DB_TEST, async () => {
  const next = await prisma.evaluationPeriod.create({
    data: { name: 'Q1 2027 (weekly test)', startDate: new Date('2027-01-01T00:00:00.000Z'), endDate: new Date('2027-03-31T00:00:00.000Z'), reviewStartDate: new Date('2027-04-05T00:00:00.000Z'), isActive: false },
  })
  const mail = mailbox()
  await sendMappingEmails(HR_ACTOR, at(1), mail.send, APP, next.id)
  const toAna = mail.sent.find((m) => m.to === email(W.ana.id))!
  assert.match(toAna.subject, /Q1 2027/)
})

test('lead and team changes go to HR, who can apply them, decline with a reason, or ask for more information', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  const pairs = async () => (await getResolvedEvaluationAssignments(periodId)).filter((a) => a.relationshipType === 'TEAM_LEAD' || a.relationshipType === 'DIRECT_REPORT').map((a) => `${a.relationshipType}:${a.evaluatorId}>${a.evaluateeId}`).sort()
  const cara = weeklyActor(W.cara)
  // Cara says Layla is her lead. HR asks first.
  const lead = await requestPeerChange(cara, { peerId: W.lead.id, action: 'ADD', relation: 'LEAD' }, at(1), mail.send, APP)
  assert.deepEqual([lead.relation, lead.approver], ['LEAD', null])
  assert.deepEqual(mail.sent, [], 'nobody else is asked: HR decides')
  await assert.rejects(decidePeerRequest(HR_ACTOR, lead.id, 'NEEDS_INFO', '', at(1, 2), mailbox().send, APP), /question/)
  const asked = mailbox()
  assert.equal((await decidePeerRequest(HR_ACTOR, lead.id, 'NEEDS_INFO', 'Since when?', at(1, 2), asked.send, APP)).status, 'NEEDS_INFO')
  assert.deepEqual(asked.sent.map((m) => m.to), [email(W.cara.id)], 'the requester is told HR has a question')
  const waiting = (await myMapping(cara, at(1, 2))).requests[0]
  assert.deepEqual([waiting.status, waiting.decisionNote], ['NEEDS_INFO', 'Since when?'])
  await assert.rejects(requestPeerChange(cara, { peerId: W.lead.id, action: 'ADD', relation: 'LEAD' }, at(1, 2), mailbox().send, APP), isStatus(409), 'still open')
  await assert.rejects(answerPeerRequest(ana, lead.id, 'x'), isStatus(404))
  assert.equal((await answerPeerRequest(cara, lead.id, 'Since September')).status, 'PENDING')
  await decidePeerRequest(HR_ACTOR, lead.id, 'APPROVE', null, at(1, 3), mailbox().send, APP)
  assert.ok((await pairs()).includes(`TEAM_LEAD:${W.lead.id}>${W.cara.id}`) && (await pairs()).includes(`DIRECT_REPORT:${W.cara.id}>${W.lead.id}`))
  assert.deepEqual((await myMapping(cara, at(2))).leads.map((p) => p.id), [W.lead.id])

  // Layla says Ben no longer reports to her; HR declines with a reason.
  const report = await requestPeerChange(weeklyActor(W.lead), { peerId: W.ben.id, action: 'REMOVE', relation: 'REPORT' }, at(2), mailbox().send, APP)
  await assert.rejects(decidePeerRequest(HR_ACTOR, report.id, 'REJECT', null, at(2, 2), mailbox().send, APP), /reason/)
  await decidePeerRequest(HR_ACTOR, report.id, 'REJECT', 'Ben still reports to Layla until December', at(2, 2), mailbox().send, APP)
  assert.ok((await pairs()).includes(`TEAM_LEAD:${W.lead.id}>${W.ben.id}`))
  await assert.rejects(requestPeerChange(ana, { peerId: W.ben.id, action: 'REMOVE', relation: 'LEAD' }, at(2), mailbox().send, APP), /not your lead/)
})

test('a lead who has not decided after 2 working days is reminded once, and HR sees the request flagged', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  // Monday of week 1.
  const request = await requestPeerChange(ana, removeBen, at(1, 1), mail.send, APP)
  const early = mailbox()
  assert.equal((await remindStaleMappingRequests(at(1, 3), early.send, APP)).sent, 0, 'Wednesday morning: not yet 2 full working days')
  assert.equal((await adminPeerRequests(HR_ACTOR)).requests[0].overdue, false)
  const due = mailbox()
  assert.equal((await remindStaleMappingRequests(at(1, 4), due.send, APP)).sent, 1)
  assert.deepEqual(due.sent.map((m) => m.to), [email(W.lead.id)])
  assert.match(due.sent[0].subject, /Reminder/)
  assert.equal((await peerRequestByToken(tokenFor(due, email(W.lead.id)))).status, 'PENDING', 'the reminder carries a working link')
  assert.equal((await remindStaleMappingRequests(at(1, 5), mailbox().send, APP)).sent, 0, 'reminded once')
  const flagged = (await adminPeerRequests(HR_ACTOR)).requests.find((r) => r.id === request.id)!
  assert.equal(flagged.overdue, true)
})

test('people confirm their lists look right during the review stage, and HR sees who has', WEEKLY_DB_TEST, async () => {
  assert.equal((await myMapping(ana, at(1))).confirmedAt, null)
  await confirmMyLists(ana, at(1, 2))
  assert.ok((await myMapping(ana, at(1, 3))).confirmedAt)
  await confirmMyLists(ana, at(1, 3)) // idempotent
  assert.equal(await prisma.mappingConfirmation.count({ where: { periodId } }), 1)
  await prisma.evaluationPeriod.update({ where: { id: periodId }, data: { isLocked: true } })
  await assert.rejects(confirmMyLists(weeklyActor(W.ben), at(1, 3)), isStatus(409))
})

test('the daily job sends the lead reminders while the round is still in review', WEEKLY_DB_TEST, async () => {
  const { runWeeklyDailyJob } = await import('../lib/weekly/service/daily-job')
  await requestPeerChange(ana, removeBen, at(1, 1), mailbox().send, APP)
  const mail = mailbox()
  const result = await runWeeklyDailyJob(mail.send, APP, at(1, 4), { model: null })
  assert.equal(result.cycleId, null, 'no round is running yet')
  assert.equal(result.mappingReminders?.sent, 1)
  assert.deepEqual(mail.sent.map((m) => m.to), [email(W.lead.id)])
})

test('the peer does not see why the requester asked; the lead does', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  await requestPeerChange(ana, { ...removeBen, reasonCode: 'OTHER', reason: 'Hard to work with' }, at(1), mail.send, APP)
  const peer = await peerRequestByToken(tokenFor(mail, email(W.ben.id)))
  assert.deepEqual([peer.reason, peer.reasonCode], [null, null])
  const lead = await peerRequestByToken(tokenFor(mail, email(W.lead.id)))
  assert.deepEqual([lead.reason, lead.reasonCode], ['Hard to work with', 'OTHER'])
})

test('while HR waits on its question, the lead cannot decide; the answer keeps the original reason and clears the question', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  const request = await requestPeerChange(ana, { ...removeBen, reason: 'Moved teams' }, at(1), mail.send, APP)
  await decidePeerRequest(HR_ACTOR, request.id, 'NEEDS_INFO', 'Which team?', at(1, 2), mailbox().send, APP)
  await assert.rejects(voteOnPeerRequest(tokenFor(mail, email(W.lead.id)), 'APPROVE', null, at(1, 2), mailbox().send, APP), isStatus(409))
  const answered = await answerPeerRequest(ana, request.id, 'Platform team')
  assert.deepEqual([answered.status, answered.reason, answered.answer, answered.decisionNote], ['PENDING', 'Moved teams', 'Platform team', null])
  assert.equal((await voteOnPeerRequest(tokenFor(mail, email(W.lead.id)), 'APPROVE', null, at(1, 3), mailbox().send, APP)).status, 'APPROVED')
  const row = await prisma.peerChangeRequest.findUniqueOrThrow({ where: { id: request.id } })
  assert.deepEqual([row.approverVote, row.status], ['APPROVED', 'APPROVED'], 'the vote and the decision are written together')
})

test('a reminder that fails to send is tried again the next day, and a decided request is never reminded', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  await requestPeerChange(ana, removeBen, at(1, 1), mail.send, APP)
  const failing = async () => { throw new Error('mail down') }
  assert.equal((await remindStaleMappingRequests(at(1, 4), failing, APP)).failed, 1)
  assert.equal((await adminPeerRequests(HR_ACTOR)).requests[0].overdue, false, 'not shown as reminded')
  assert.equal((await remindStaleMappingRequests(at(1, 5), mailbox().send, APP)).sent, 1)
  const other = mailbox()
  await requestPeerChange(weeklyActor(W.ben), { peerId: W.cara.id, action: 'ADD' }, at(1, 1), other.send, APP)
  await voteOnPeerRequest(tokenFor(other, email(W.lead.id)), 'APPROVE', null, at(1, 2), mailbox().send, APP)
  assert.equal((await remindStaleMappingRequests(at(2, 1), mailbox().send, APP)).sent, 0)
})

test('asking for a change after saying the lists look right undoes the confirmation', WEEKLY_DB_TEST, async () => {
  await confirmMyLists(ana, at(1))
  await requestPeerChange(ana, removeBen, at(1, 2), mailbox().send, APP)
  assert.equal((await myMapping(ana, at(1, 2))).confirmedAt, null)
})

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
/** The emails to anyone but HR (the shared test database may hold other HR users). */
async function notHr(mail: ReturnType<typeof mailbox>) {
  const hr = new Set((await prisma.user.findMany({ where: { role: 'HR' }, select: { email: true } })).map((u) => u.email))
  return mail.sent.filter((m) => !hr.has(m.to))
}
const toHr = (mail: ReturnType<typeof mailbox>) => mail.sent.filter((m) => m.to === email(W.hr.id))
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

test('a team member’s change goes to their lead to review, then HR decides; the peer is only told', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  const request = await requestPeerChange(ana, { ...removeBen, reason: 'Ben moved to another project' }, at(1), mail.send, APP)
  assert.deepEqual([request.status, request.reasonCode, request.approver?.id, request.stage], ['PENDING', 'NO_LONGER_WORK_TOGETHER', W.lead.id, 'LEAD'])
  assert.deepEqual(mail.sent.map((m) => m.to).sort(), [email(W.ben.id), email(W.lead.id)].sort())
  const toBen = mail.sent.find((m) => m.to === email(W.ben.id))!
  assert.doesNotMatch(toBen.html, /approve/i, 'the peer is not asked to approve')
  assert.match(mail.sent.find((m) => m.to === email(W.lead.id))!.html, /HR makes the final decision/)

  const view = await peerRequestByToken(tokenFor(mail, email(W.lead.id)))
  assert.deepEqual([view.requester.name, view.peer.name, view.action, view.role, view.status], [W.ana.name, W.ben.name, 'REMOVE', 'LEAD', 'PENDING'])
  assert.equal(view.peersLeft, 0, 'the lead sees Ana would be left with no peers')
  const reviewed = mailbox()
  assert.equal((await voteOnPeerRequest(tokenFor(mail, email(W.lead.id)), 'APPROVE', null, at(1, 2), reviewed.send, APP)).status, 'PENDING')
  assert.equal((await peerPairs()).length, 2, 'nothing changes on the lead’s review alone')
  assert.deepEqual(await notHr(reviewed), [], 'the requester hears only HR’s decision')
  const waiting = (await adminPeerRequests(HR_ACTOR)).requests.find((r) => r.id === request.id)!
  assert.deepEqual([waiting.stage, waiting.approverVote], ['HR', 'APPROVED'])
  const done = mailbox()
  assert.equal((await decidePeerRequest(HR_ACTOR, request.id, 'APPROVE', null, at(1, 3), done.send, APP)).status, 'APPROVED')
  assert.deepEqual(await peerPairs(), [], 'both directions are removed')
  assert.deepEqual(done.sent.map((m) => m.to).sort(), [email(W.ana.id), email(W.ben.id)].sort(), 'the requester and the peer hear the outcome')
})

test('the peer can say whether they work together; it is shown to the lead and HR and blocks nothing', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  const request = await requestPeerChange(ana, { peerId: W.cara.id, action: 'ADD' }, at(1), mail.send, APP)
  const caraToken = tokenFor(mail, email(W.cara.id))
  assert.equal((await peerRequestByToken(caraToken)).role, 'PEER')
  await assert.rejects(voteOnPeerRequest(caraToken, 'APPROVE', null, at(1, 2), mailbox().send, APP), isStatus(403))
  await replyToPeerRequest(caraToken, 'NOT_WORK_TOGETHER', at(1, 2), mailbox().send, APP)
  assert.equal((await peerRequestByToken(tokenFor(mail, email(W.lead.id)))).peerReply, 'NOT_WORK_TOGETHER')
  assert.equal((await adminPeerRequests(HR_ACTOR)).requests.find((r) => r.id === request.id)?.peerReply, 'NOT_WORK_TOGETHER')
  // The peer may change their mind; it still blocks nothing.
  await replyToPeerRequest(caraToken, 'WORK_TOGETHER', at(1, 3), mailbox().send, APP)
  await voteOnPeerRequest(tokenFor(mail, email(W.lead.id)), 'APPROVE', null, at(1, 3), mailbox().send, APP)
  assert.equal((await decidePeerRequest(HR_ACTOR, request.id, 'APPROVE', null, at(1, 3), mailbox().send, APP)).status, 'APPROVED')
  assert.deepEqual((await myMapping(ana, at(2))).peers.map((p) => p.id).sort(), [W.ben.id, W.cara.id].sort())
})

test('a lead who disagrees gives a reason; it still goes to HR, who sees it and decides', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  const request = await requestPeerChange(ana, removeBen, at(1), mail.send, APP)
  const lead = tokenFor(mail, email(W.lead.id))
  await assert.rejects(voteOnPeerRequest(lead, 'REJECT', '  ', at(1, 2), mailbox().send, APP), /reason/)
  assert.equal((await voteOnPeerRequest(lead, 'REJECT', 'Ana and Ben still review each other’s work', at(1, 2), mailbox().send, APP)).status, 'PENDING')
  const seen = (await adminPeerRequests(HR_ACTOR)).requests.find((r) => r.id === request.id)!
  assert.deepEqual([seen.stage, seen.approverVote, seen.leadNote], ['HR', 'REJECTED', 'Ana and Ben still review each other’s work'])
  await assert.rejects(voteOnPeerRequest(lead, 'APPROVE', null, at(1, 3), mailbox().send, APP), isStatus(409), 'the lead reviews once')
  await decidePeerRequest(HR_ACTOR, request.id, 'REJECT', 'Agreed with Layla', at(1, 3), mailbox().send, APP)
  assert.equal((await peerPairs()).length, 2)
  const [mine] = (await myMapping(ana, at(2))).requests
  assert.deepEqual([mine.status, mine.decisionNote], ['REJECTED', 'Agreed with Layla'])
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
  assert.deepEqual((await notHr(mail)).map((m) => m.to), [email(W.ana.id)], 'only the peer is told, and HR')
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
  await prisma.weeklyCycle.updateMany({ where: { periodId }, data: { reviewDeadline: new Date('2026-10-01T19:00:00.000Z') } })
  await assert.rejects(sendMappingEmails(ana, at(1), mail.send, APP), isStatus(403))
  const result = await sendMappingEmails(HR_ACTOR, at(1), mail.send, APP)
  assert.ok(result.sent >= 3)
  assert.equal(mail.sent.find((m) => m.to === email(W.ana.id))?.subject, 'Check your Q4 2026 (weekly test) evaluation lists by 2 Oct 2026')
  const toLead = mail.sent.find((m) => m.to === email(W.lead.id))!
  assert.match(toLead.html, new RegExp(W.ana.name))
  assert.match(toLead.html, /\/evaluations\/weekly/)
  const toAna = mail.sent.find((m) => m.to === email(W.ana.id))!
  assert.match(toAna.html, new RegExp(W.lead.name))
  assert.match(toAna.html, new RegExp(W.ben.name))
  assert.match(toAna.html, /Your lead reviews each change first, then HR decides/)
})

test('a link stops working once HR locks the quarter', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  await requestPeerChange(ana, removeBen, at(1), mail.send, APP)
  await prisma.evaluationPeriod.update({ where: { id: periodId }, data: { isLocked: true } })
  await assert.rejects(voteOnPeerRequest(tokenFor(mail, email(W.lead.id)), 'APPROVE', null, at(2), mailbox().send, APP), /locked/)
  await assert.rejects(replyToPeerRequest(tokenFor(mail, email(W.ben.id)), 'WORK_TOGETHER', at(2), mailbox().send, APP), /locked/)
})

test('two HR decisions at the same moment make the change once', WEEKLY_DB_TEST, async () => {
  const request = await requestPeerChange(ana, removeBen, at(1), mailbox().send, APP)
  const results = await Promise.allSettled([
    decidePeerRequest(HR_ACTOR, request.id, 'APPROVE', null, at(1, 2), mailbox().send, APP),
    decidePeerRequest(HR_ACTOR, request.id, 'APPROVE', null, at(1, 2), mailbox().send, APP),
  ])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
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

test('lead and team changes: a team member’s lead reviews them first; someone with no lead goes straight to HR, who can apply, decline or ask', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  const pairs = async () => (await getResolvedEvaluationAssignments(periodId)).filter((a) => a.relationshipType === 'TEAM_LEAD' || a.relationshipType === 'DIRECT_REPORT').map((a) => `${a.relationshipType}:${a.evaluatorId}>${a.evaluateeId}`).sort()
  const cara = weeklyActor(W.cara)
  // Cara has no lead: straight to HR. HR asks first.
  const lead = await requestPeerChange(cara, { peerId: W.lead.id, action: 'ADD', relation: 'LEAD' }, at(1), mail.send, APP)
  assert.deepEqual([lead.relation, lead.approver, lead.stage], ['LEAD', null, 'HR'])
  assert.deepEqual((await notHr(mail)).map((m) => m.to), [email(W.cara.id)], 'nobody else is asked: HR decides; Cara gets a confirmation')
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

  // Ben asks to add Cara to his team: his lead, Layla, reviews it first.
  const team = mailbox()
  const report = await requestPeerChange(weeklyActor(W.ben), { peerId: W.cara.id, action: 'ADD', relation: 'REPORT' }, at(2), team.send, APP)
  assert.deepEqual([report.approver?.id, report.stage], [W.lead.id, 'LEAD'])
  assert.deepEqual(team.sent.map((m) => m.to).sort(), [email(W.ben.id), email(W.lead.id)], 'the lead reviews it and Ben gets a confirmation; there is no peer to tell')
  assert.match(team.sent.find((m) => m.to === email(W.lead.id))?.html ?? '', /to their team/)
  await voteOnPeerRequest(tokenFor(team, email(W.lead.id)), 'REJECT', 'Cara reports to Design', at(2, 2), mailbox().send, APP)
  await assert.rejects(decidePeerRequest(HR_ACTOR, report.id, 'REJECT', null, at(2, 3), mailbox().send, APP), /reason/)
  await decidePeerRequest(HR_ACTOR, report.id, 'REJECT', 'Cara stays in Design', at(2, 3), mailbox().send, APP)
  assert.ok(!(await pairs()).includes(`TEAM_LEAD:${W.ben.id}>${W.cara.id}`))
  await assert.rejects(requestPeerChange(ana, { peerId: W.ben.id, action: 'REMOVE', relation: 'LEAD' }, at(2), mailbox().send, APP), /not your lead/)
})

test('a change about the lead themselves is not reviewed by that lead: HR decides', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  const request = await requestPeerChange(ana, { peerId: W.lead.id, action: 'REMOVE', relation: 'LEAD' }, at(1), mail.send, APP)
  assert.deepEqual([request.approver, request.stage], [null, 'HR'])
  assert.deepEqual((await notHr(mail)).map((m) => m.subject), ['We got your request: remove Layla Mercer as your lead'], 'Layla is not asked; Ana gets a confirmation')
  assert.equal(toHr(mail).length, 1, 'HR is told it is theirs to decide')
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

test('while HR waits on its question, the lead cannot review; the answer keeps the original reason and clears the question', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  const request = await requestPeerChange(ana, { ...removeBen, reason: 'Moved teams' }, at(1), mail.send, APP)
  await decidePeerRequest(HR_ACTOR, request.id, 'NEEDS_INFO', 'Which team?', at(1, 2), mailbox().send, APP)
  await assert.rejects(voteOnPeerRequest(tokenFor(mail, email(W.lead.id)), 'APPROVE', null, at(1, 2), mailbox().send, APP), isStatus(409))
  const answered = await answerPeerRequest(ana, request.id, 'Platform team')
  assert.deepEqual([answered.status, answered.reason, answered.answer, answered.decisionNote], ['PENDING', 'Moved teams', 'Platform team', null])
  assert.equal((await voteOnPeerRequest(tokenFor(mail, email(W.lead.id)), 'APPROVE', null, at(1, 3), mailbox().send, APP)).status, 'PENDING')
  const row = await prisma.peerChangeRequest.findUniqueOrThrow({ where: { id: request.id } })
  assert.deepEqual([row.approverVote, row.status], ['APPROVED', 'PENDING'], 'the lead reviewed; HR still decides')
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

test('a lead or team request is confirmed to the requester, and HR is emailed once a request is theirs to decide', WEEKLY_DB_TEST, async () => {
  const team = mailbox()
  await requestPeerChange(weeklyActor(W.ben), { peerId: W.cara.id, action: 'ADD', relation: 'REPORT' }, at(1), team.send, APP)
  assert.deepEqual(team.sent.filter((m) => m.to === email(W.ben.id)).map((m) => m.subject), ['We got your request: add Cara Lindqvist to your team'])
  assert.match(team.sent.find((m) => m.to === email(W.ben.id))?.html ?? '', /Layla Mercer reviews it first/)
  assert.deepEqual(toHr(team), [], 'the lead reviews it first')
  const reviewed = mailbox()
  await voteOnPeerRequest(tokenFor(team, email(W.lead.id)), 'REJECT', 'Cara reports to Design', at(1, 2), reviewed.send, APP)
  assert.deepEqual(toHr(reviewed).map((m) => m.subject), ['To decide: Ben Okafor asked to add Cara Lindqvist to their team'])
  assert.match(toHr(reviewed)[0].html, /Layla Mercer disagrees: Cara reports to Design/)
  // No lead to review it: HR hears at once.
  const direct = mailbox()
  await requestPeerChange(weeklyActor(W.cara), { peerId: W.ana.id, action: 'ADD' }, at(1), direct.send, APP)
  assert.equal(toHr(direct).length, 1)
  assert.match(toHr(direct)[0].html, /came straight to you/)
  assert.deepEqual(direct.sent.filter((m) => m.to === email(W.cara.id)), [], 'a peer request is not confirmed by email; the page shows it')
})

test('the peer’s reply is emailed to the lead and HR, once per answer', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  await requestPeerChange(ana, removeBen, at(1), mail.send, APP)
  const benToken = tokenFor(mail, email(W.ben.id))
  const replied = mailbox()
  await replyToPeerRequest(benToken, 'WORK_TOGETHER', at(1, 2), replied.send, APP)
  assert.deepEqual(replied.sent.filter((m) => m.to === email(W.lead.id)).map((m) => m.subject), ['Ben Okafor says they do work with Ana Torvik'])
  assert.equal(toHr(replied).length, 1)
  await replyToPeerRequest(benToken, 'WORK_TOGETHER', at(1, 2), replied.send, APP)
  assert.equal(replied.sent.filter((m) => m.to === email(W.lead.id)).length, 1, 'the same answer again sends nothing')
  const changed = mailbox()
  await replyToPeerRequest(benToken, 'NOT_WORK_TOGETHER', at(1, 3), changed.send, APP)
  assert.deepEqual(changed.sent.filter((m) => m.to === email(W.lead.id)).map((m) => m.subject), ['Ben Okafor says they don’t work with Ana Torvik'])
})

test('a declined peer change reaches the peer with HR’s reason; an applied team change tells the new team member who their lead is', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  const request = await requestPeerChange(ana, removeBen, at(1), mail.send, APP)
  const declined = mailbox()
  await decidePeerRequest(HR_ACTOR, request.id, 'REJECT', 'You still review each other’s work', at(1, 3), declined.send, APP)
  const toBen = declined.sent.find((m) => m.to === email(W.ben.id))
  assert.equal(toBen?.subject, 'Not approved: Ana Torvik’s request about you')
  assert.match(toBen?.html ?? '', /You still review each other’s work/)
  // Layla has no lead, so HR decides her request at once.
  const team = await requestPeerChange(weeklyActor(W.lead), { peerId: W.cara.id, action: 'ADD', relation: 'REPORT' }, at(1), mailbox().send, APP)
  const applied = mailbox()
  await decidePeerRequest(HR_ACTOR, team.id, 'APPROVE', null, at(1, 3), applied.send, APP)
  assert.deepEqual(applied.sent.filter((m) => m.to === email(W.cara.id)).map((m) => m.subject), ['Your lead for Q4 2026 (weekly test) is now Layla Mercer'])
})

test('a peer who changes their answer back is heard again', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  await requestPeerChange(ana, removeBen, at(1), mail.send, APP)
  const token = tokenFor(mail, email(W.ben.id))
  const replies = mailbox()
  await replyToPeerRequest(token, 'WORK_TOGETHER', at(1, 2), replies.send, APP)
  await replyToPeerRequest(token, 'NOT_WORK_TOGETHER', at(1, 3), replies.send, APP)
  await replyToPeerRequest(token, 'WORK_TOGETHER', at(1, 4), replies.send, APP)
  assert.equal(replies.sent.filter((m) => m.to === email(W.lead.id)).length, 3)
})

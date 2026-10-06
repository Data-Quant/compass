import test, { after, afterEach, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { getResolvedEvaluationAssignments } from '../lib/evaluation-assignments'
import { WeeklyError } from '../lib/weekly/service/errors'
import {
  cancelPeerRequest, decidePeerRequest, myMapping, peerRequestByToken, requestPeerChange, sendMappingEmails, voteOnPeerRequest,
} from '../lib/weekly/service/peer-requests'
import { at, HR_ACTOR, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const APP = 'https://compass.example'
const isStatus = (status: number) => (e: unknown) => e instanceof WeeklyError && e.status === status
function mailbox() {
  const sent: Array<{ to: string; subject: string; html: string }> = []
  return { sent, send: async (to: string, subject: string, html: string) => { sent.push({ to, subject, html }) } }
}
/** The one-click link in the email to `to`. */
const tokenFor = (mail: ReturnType<typeof mailbox>, to: string) => {
  const html = mail.sent.find((m) => m.to === to)?.html ?? ''
  const match = html.match(/\/peer-requests\/([A-Za-z0-9_-]+)/)
  assert.ok(match, `no link in the email to ${to}`)
  return match[1]
}
const email = (id: string) => `${id}@example.test`
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

const peerPairs = async () => (await getResolvedEvaluationAssignments(periodId)).filter((a) => a.relationshipType === 'PEER').map((a) => `${a.evaluatorId}>${a.evaluateeId}`).sort()

test('everyone sees their lead, their team and their peers for the quarter', WEEKLY_DB_TEST, async () => {
  const mine = await myMapping(ana, at(1))
  assert.deepEqual([mine.leads.map((p) => p.id), mine.reports.map((p) => p.id), mine.peers.map((p) => p.id)], [[W.lead.id], [], [W.ben.id]])
  const lead = await myMapping(weeklyActor(W.lead), at(1))
  assert.deepEqual(lead.reports.map((p) => p.id).sort(), [W.ana.id, W.ben.id].sort())
})

test('removing a peer takes effect only when the peer and the lead both approve, each with one click', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  const request = await requestPeerChange(ana, { peerId: W.ben.id, action: 'REMOVE', reason: 'We have not worked together this quarter' }, at(1), mail.send, APP)
  assert.equal(request.status, 'PENDING')
  assert.deepEqual(mail.sent.map((m) => m.to).sort(), [email(W.ben.id), email(W.lead.id)].sort())
  const peerToken = tokenFor(mail, email(W.ben.id))
  const leadToken = tokenFor(mail, email(W.lead.id))

  const view = await peerRequestByToken(peerToken)
  assert.deepEqual([view.requester.name, view.peer.name, view.action, view.role, view.status], [W.ana.name, W.ben.name, 'REMOVE', 'PEER', 'PENDING'])
  const done = mailbox()
  assert.equal((await voteOnPeerRequest(peerToken, 'APPROVE', at(1, 2), done.send, APP)).status, 'PENDING')
  assert.ok((await peerPairs()).includes(`${W.ana.id}>${W.ben.id}`), 'nothing changes on one approval')
  assert.equal((await voteOnPeerRequest(leadToken, 'APPROVE', at(1, 2), done.send, APP)).status, 'APPROVED')
  assert.deepEqual(await peerPairs(), [], 'both directions are removed')
  assert.deepEqual(done.sent.map((m) => m.to), [email(W.ana.id)], 'the requester hears the outcome')
  await assert.rejects(voteOnPeerRequest(peerToken, 'REJECT', at(1, 3), done.send, APP), isStatus(409))
})

test('either one declining rejects the request, and adding a peer works the same way', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  await requestPeerChange(ana, { peerId: W.ben.id, action: 'REMOVE' }, at(1), mail.send, APP)
  assert.equal((await voteOnPeerRequest(tokenFor(mail, email(W.ben.id)), 'REJECT', at(1, 2), mailbox().send, APP)).status, 'REJECTED')
  assert.equal((await peerPairs()).length, 2)

  const add = mailbox()
  await requestPeerChange(ana, { peerId: W.cara.id, action: 'ADD' }, at(1, 3), add.send, APP)
  await voteOnPeerRequest(tokenFor(add, email(W.cara.id)), 'APPROVE', at(1, 4), mailbox().send, APP)
  await voteOnPeerRequest(tokenFor(add, email(W.lead.id)), 'APPROVE', at(1, 4), mailbox().send, APP)
  assert.ok((await peerPairs()).includes(`${W.ana.id}>${W.cara.id}`) && (await peerPairs()).includes(`${W.cara.id}>${W.ana.id}`))
  assert.deepEqual((await myMapping(ana, at(2))).peers.map((p) => p.id).sort(), [W.ben.id, W.cara.id].sort())
})

test('with no lead to approve, HR decides; HR can also decide any request', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  const request = await requestPeerChange(weeklyActor(W.cara), { peerId: W.ana.id, action: 'ADD' }, at(1), mail.send, APP)
  assert.deepEqual(mail.sent.map((m) => m.to), [email(W.ana.id)], 'only the peer is asked')
  assert.equal((await voteOnPeerRequest(tokenFor(mail, email(W.ana.id)), 'APPROVE', at(1, 2), mailbox().send, APP)).status, 'PENDING')
  await assert.rejects(decidePeerRequest(ana, request.id, 'APPROVE', at(1, 3), mailbox().send, APP), isStatus(403))
  assert.equal((await decidePeerRequest(HR_ACTOR, request.id, 'APPROVE', at(1, 3), mailbox().send, APP)).status, 'APPROVED')
  assert.ok((await peerPairs()).includes(`${W.cara.id}>${W.ana.id}`))
})

test('requests must make sense: no duplicates, no removing a non-peer, no adding a peer twice or yourself; the requester can cancel', WEEKLY_DB_TEST, async () => {
  const send = mailbox().send
  const request = await requestPeerChange(ana, { peerId: W.ben.id, action: 'REMOVE' }, at(1), send, APP)
  await assert.rejects(requestPeerChange(ana, { peerId: W.ben.id, action: 'REMOVE' }, at(1), send, APP), isStatus(409))
  await assert.rejects(requestPeerChange(ana, { peerId: W.cara.id, action: 'REMOVE' }, at(1), send, APP), /not one of your peers/)
  await assert.rejects(requestPeerChange(ana, { peerId: W.ben.id, action: 'ADD' }, at(1), send, APP), /already/)
  await assert.rejects(requestPeerChange(ana, { peerId: W.ana.id, action: 'ADD' }, at(1), send, APP), /yourself/)
  await assert.rejects(cancelPeerRequest(weeklyActor(W.ben), request.id), isStatus(404))
  await cancelPeerRequest(ana, request.id)
  assert.equal((await prisma.peerChangeRequest.findUniqueOrThrow({ where: { id: request.id } })).status, 'CANCELLED')
  await prisma.evaluationPeriod.update({ where: { id: periodId }, data: { isLocked: true } })
  await assert.rejects(requestPeerChange(ana, { peerId: W.ben.id, action: 'REMOVE' }, at(1), send, APP), /locked/)
})

test('HR emails everyone their mapping for the quarter, with a link to request peer changes', WEEKLY_DB_TEST, async () => {
  const mail = mailbox()
  await assert.rejects(sendMappingEmails(ana, at(1), mail.send, APP), isStatus(403))
  const result = await sendMappingEmails(HR_ACTOR, at(1), mail.send, APP)
  assert.ok(result.sent >= 3)
  const toLead = mail.sent.find((m) => m.to === email(W.lead.id))!
  assert.match(toLead.html, new RegExp(W.ana.name))
  assert.match(toLead.html, /\/pre-evaluation/)
  const toAna = mail.sent.find((m) => m.to === email(W.ana.id))!
  assert.match(toAna.html, new RegExp(W.lead.name))
  assert.match(toAna.html, new RegExp(W.ben.name))
})

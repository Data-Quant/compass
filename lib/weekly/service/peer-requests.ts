// Section 4 of HR's feedback: leads and reporting lines are HR's; peers are the employee's to correct. An employee asks
// to add or remove a peer for the quarter; it takes effect once that peer and the employee's lead both approve (one click
// each, from an email), or HR decides. An approved change is written as period overrides in both directions.
import { createHash, randomBytes } from 'node:crypto'
import type { PeerChangeAction, PeerChangeRequest, PeerChangeStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { renderMappingEmail, renderPeerOutcomeEmail, renderPeerRequestEmail } from '../emails'
import { isOutsideRedesign } from '../eligibility'
import type { MyMappingResponse, PeerRequestTokenView, PeerRequestView, PersonRef } from '../view-types'
import { recordAudit } from './audit'
import { assertHr, loadPeople, personRef, type WeeklyActor } from './context'
import { WeeklyError } from './errors'
import { deliverOnce, type WeeklyEmailMessage, type WeeklySendMail, type WeeklySendResult } from './notifications'

export type PeerDecision = 'APPROVE' | 'REJECT'
const LOCKED = 'This quarter is locked, so its mapping can no longer change'
const base = (appUrl: string) => appUrl.replace(/\/$/, '')
const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const newToken = () => randomBytes(32).toString('base64url')

/** The quarter being mapped: the newest cycle in setup or running, else the active period. */
async function mappingPeriod(): Promise<{ id: string; name: string; isLocked: boolean }> {
  const cycle = await prisma.weeklyCycle.findFirst({ where: { status: { in: ['SETUP', 'RUNNING'] } }, orderBy: { weekOneStartsOn: 'desc' }, select: { periodId: true } })
  const period = cycle
    ? await prisma.evaluationPeriod.findUnique({ where: { id: cycle.periodId }, select: { id: true, name: true, isLocked: true } })
    : await prisma.evaluationPeriod.findFirst({ where: { isActive: true }, select: { id: true, name: true, isLocked: true } })
  if (!period) throw new WeeklyError('There is no quarter to map yet', 409)
  return period
}

interface Mapping { leads: string[]; reports: string[]; peers: string[] }

function mappingOf(userId: string, assignments: ReadonlyArray<{ evaluatorId: string; evaluateeId: string; relationshipType: string }>): Mapping {
  const ids = (list: string[]) => [...new Set(list)].filter((id) => id !== userId)
  const as = (type: string, side: 'evaluatorId' | 'evaluateeId', other: 'evaluatorId' | 'evaluateeId') =>
    assignments.filter((a) => a.relationshipType === type && a[side] === userId).map((a) => a[other])
  return {
    leads: ids([...as('TEAM_LEAD', 'evaluateeId', 'evaluatorId'), ...as('DIRECT_REPORT', 'evaluatorId', 'evaluateeId')]),
    reports: ids([...as('TEAM_LEAD', 'evaluatorId', 'evaluateeId'), ...as('DIRECT_REPORT', 'evaluateeId', 'evaluatorId')]),
    peers: ids([...as('PEER', 'evaluatorId', 'evaluateeId'), ...as('PEER', 'evaluateeId', 'evaluatorId')]),
  }
}

async function mappingFor(periodId: string, userId: string): Promise<Mapping> {
  return mappingOf(userId, await getResolvedEvaluationAssignments(periodId))
}

function requestView(r: PeerChangeRequest, people: ReadonlyMap<string, { name: string; position: string | null }>): PeerRequestView {
  return {
    id: r.id, action: r.action, status: r.status, reason: r.reason, createdAt: r.createdAt.toISOString(),
    requester: personRef(people, r.requesterId), peer: personRef(people, r.peerId),
    approver: r.approverId ? personRef(people, r.approverId) : null, peerVote: r.peerVote, approverVote: r.approverVote,
  }
}

export async function myMapping(actor: WeeklyActor, now: Date): Promise<MyMappingResponse> {
  void now
  const period = await mappingPeriod()
  const mapping = await mappingFor(period.id, actor.id)
  const requests = await prisma.peerChangeRequest.findMany({ where: { periodId: period.id, requesterId: actor.id }, orderBy: { createdAt: 'desc' } })
  const candidates = await prisma.user.findMany({
    where: { id: { notIn: [actor.id, ...mapping.peers] }, OR: [{ payrollProfile: null }, { payrollProfile: { isPayrollActive: true } }] },
    select: { id: true, name: true, position: true, department: true },
    orderBy: { name: 'asc' },
  })
  const people = await loadPeople([...mapping.leads, ...mapping.reports, ...mapping.peers, ...requests.flatMap((r) => [r.requesterId, r.peerId, r.approverId ?? ''])])
  const refs = (ids: string[]): PersonRef[] => ids.map((id) => personRef(people, id)).sort((a, b) => a.name.localeCompare(b.name))
  return {
    period: { id: period.id, name: period.name, locked: period.isLocked },
    leads: refs(mapping.leads), reports: refs(mapping.reports), peers: refs(mapping.peers),
    requests: requests.map((r) => requestView(r, people)),
    candidates: candidates.filter((c) => !isOutsideRedesign(c)).map((c) => ({ id: c.id, name: c.name, position: c.position })),
  }
}

function approvalMessages(request: PeerChangeRequest, tokens: { peer: string; approver: string | null }, names: { requester: string; peer: string }, periodName: string, appUrl: string): WeeklyEmailMessage[] {
  const message = (userId: string, role: 'PEER' | 'LEAD', token: string): WeeklyEmailMessage => ({
    userId, kind: 'peer-request', dedupeKey: `peer-request:${request.id}:${userId}`,
    render: (name) => renderPeerRequestEmail({ name, requesterName: names.requester, peerName: names.peer, action: request.action, role, periodName, link: `${base(appUrl)}/peer-requests/${token}` }),
  })
  return [message(request.peerId, 'PEER', tokens.peer), ...(request.approverId && tokens.approver ? [message(request.approverId, 'LEAD', tokens.approver)] : [])]
}

export async function requestPeerChange(
  actor: WeeklyActor, input: { peerId: string; action: PeerChangeAction; reason?: string | null }, now: Date, send: WeeklySendMail, appUrl: string,
): Promise<PeerRequestView> {
  const period = await mappingPeriod()
  if (period.isLocked) throw new WeeklyError(LOCKED, 409)
  if (input.peerId === actor.id) throw new WeeklyError('You cannot add or remove yourself as a peer')
  const peer = (await loadPeople([input.peerId])).get(input.peerId)
  if (!peer || !peer.payrollActive || isOutsideRedesign(peer)) throw new WeeklyError('Person not found', 404)
  const mapping = await mappingFor(period.id, actor.id)
  if (input.action === 'REMOVE' && !mapping.peers.includes(input.peerId)) throw new WeeklyError(`${peer.name} is not one of your peers this quarter`)
  if (input.action === 'ADD' && [...mapping.peers, ...mapping.leads, ...mapping.reports].includes(input.peerId)) throw new WeeklyError(`${peer.name} is already in your mapping this quarter`)
  const pending = await prisma.peerChangeRequest.count({
    where: { periodId: period.id, status: 'PENDING', OR: [{ requesterId: actor.id, peerId: input.peerId }, { requesterId: input.peerId, peerId: actor.id }] },
  })
  if (pending > 0) throw new WeeklyError('There is already a request about this peer waiting for approval', 409)
  // The lead approves; when there is none, or the lead is the peer in question, HR decides instead.
  const approverId = mapping.leads.find((id) => id !== input.peerId) ?? null
  const tokens = { peer: newToken(), approver: approverId ? newToken() : null }
  const request = await prisma.peerChangeRequest.create({
    data: {
      periodId: period.id, requesterId: actor.id, peerId: input.peerId, action: input.action, reason: input.reason?.trim() || null,
      peerTokenHash: hash(tokens.peer), approverId, approverTokenHash: tokens.approver ? hash(tokens.approver) : null,
    },
  })
  await recordAudit(prisma, { actorId: actor.id, actorRole: 'EMPLOYEE', action: 'PEER_REQUEST', objectType: 'PeerChangeRequest', objectId: request.id, after: { action: input.action, peerId: input.peerId } })
  await deliverOnce(approvalMessages(request, tokens, { requester: actor.name, peer: peer.name }, period.name, appUrl), send)
  const people = await loadPeople([actor.id, input.peerId, approverId ?? ''])
  return requestView(request, people)
}

export async function cancelPeerRequest(actor: WeeklyActor, requestId: string): Promise<void> {
  const cancelled = await prisma.peerChangeRequest.updateMany({ where: { id: requestId, requesterId: actor.id, status: 'PENDING' }, data: { status: 'CANCELLED' } })
  if (cancelled.count === 0) throw new WeeklyError('Request not found', 404)
}

/** Both directions of the peer pair, for this period only. */
async function applyChange(request: PeerChangeRequest, decidedById: string | null): Promise<void> {
  for (const [evaluatorId, evaluateeId] of [[request.requesterId, request.peerId], [request.peerId, request.requesterId]]) {
    const key = { periodId: request.periodId, evaluatorId, evaluateeId, relationshipType: 'PEER' as const }
    await prisma.evaluationPeriodAssignmentOverride.upsert({
      where: { periodId_evaluatorId_evaluateeId_relationshipType: key },
      create: { ...key, action: request.action, note: `Peer request ${request.id}`, createdById: decidedById },
      update: { action: request.action, note: `Peer request ${request.id}` },
    })
  }
}

/** Moves a request on after a vote or an HR decision: any rejection rejects it; both approvals approve and apply it. */
async function settle(requestId: string, now: Date, send: WeeklySendMail, appUrl: string, hrDecision?: { by: string; decision: PeerDecision }): Promise<PeerChangeStatus> {
  const request = await prisma.peerChangeRequest.findUniqueOrThrow({ where: { id: requestId } })
  const rejected = hrDecision ? hrDecision.decision === 'REJECT' : request.peerVote === 'REJECTED' || request.approverVote === 'REJECTED'
  const approved = hrDecision ? hrDecision.decision === 'APPROVE' : request.peerVote === 'APPROVED' && request.approverId !== null && request.approverVote === 'APPROVED'
  if (!rejected && !approved) return 'PENDING'
  const status: PeerChangeStatus = approved ? 'APPROVED' : 'REJECTED'
  const moved = await prisma.peerChangeRequest.updateMany({
    where: { id: requestId, status: 'PENDING' },
    data: { status, decidedAt: now, ...(hrDecision ? { decidedById: hrDecision.by } : {}) },
  })
  if (moved.count === 0) throw new WeeklyError('This request was already decided', 409)
  if (approved) await applyChange(request, hrDecision?.by ?? null)
  const peer = (await loadPeople([request.peerId])).get(request.peerId)
  await deliverOnce([{
    userId: request.requesterId, kind: 'peer-request-outcome', dedupeKey: `peer-request-outcome:${request.id}`,
    render: (name) => renderPeerOutcomeEmail({ name, peerName: peer?.name ?? 'the peer', action: request.action, approved, appUrl }),
  }], send)
  return status
}

async function findByToken(token: string): Promise<{ request: PeerChangeRequest; role: 'PEER' | 'LEAD' }> {
  const hashed = hash(token)
  const request = await prisma.peerChangeRequest.findFirst({ where: { OR: [{ peerTokenHash: hashed }, { approverTokenHash: hashed }] } })
  if (!request) throw new WeeklyError('This link is not valid', 404)
  return { request, role: request.peerTokenHash === hashed ? 'PEER' : 'LEAD' }
}

export async function peerRequestByToken(token: string): Promise<PeerRequestTokenView> {
  const { request, role } = await findByToken(token)
  const people = await loadPeople([request.requesterId, request.peerId])
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: request.periodId }, select: { name: true } })
  return {
    requester: personRef(people, request.requesterId), peer: personRef(people, request.peerId), action: request.action, role, status: request.status,
    vote: role === 'PEER' ? request.peerVote : request.approverVote, periodName: period?.name ?? '', reason: request.reason,
  }
}

/** The one-click approval from the email link. Each link votes once. */
export async function voteOnPeerRequest(token: string, decision: PeerDecision, now: Date, send: WeeklySendMail, appUrl: string): Promise<{ status: PeerChangeStatus }> {
  const { request, role } = await findByToken(token)
  const vote = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'
  // Guarded on the vote still being open, so a second click (or a race) changes nothing.
  const voted = role === 'PEER'
    ? await prisma.peerChangeRequest.updateMany({ where: { id: request.id, status: 'PENDING', peerVote: 'PENDING' }, data: { peerVote: vote, peerVotedAt: now } })
    : await prisma.peerChangeRequest.updateMany({ where: { id: request.id, status: 'PENDING', approverVote: 'PENDING' }, data: { approverVote: vote, approverVotedAt: now } })
  if (voted.count === 0) throw new WeeklyError('This request was already answered', 409)
  await recordAudit(prisma, { actorId: role === 'PEER' ? request.peerId : request.approverId, actorRole: role, action: `PEER_VOTE_${vote}`, objectType: 'PeerChangeRequest', objectId: request.id })
  return { status: await settle(request.id, now, send, appUrl) }
}

export async function decidePeerRequest(actor: WeeklyActor, requestId: string, decision: PeerDecision, now: Date, send: WeeklySendMail, appUrl: string): Promise<{ status: PeerChangeStatus }> {
  assertHr(actor)
  const request = await prisma.peerChangeRequest.findUnique({ where: { id: requestId } })
  if (!request) throw new WeeklyError('Request not found', 404)
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: request.periodId }, select: { isLocked: true } })
  if (period?.isLocked) throw new WeeklyError(LOCKED, 409)
  const status = await settle(requestId, now, send, appUrl, { by: actor.id, decision })
  await recordAudit(prisma, { actorId: actor.id, actorRole: 'HR', action: `PEER_DECIDE_${decision}`, objectType: 'PeerChangeRequest', objectId: requestId })
  return { status }
}

export async function adminPeerRequests(actor: WeeklyActor): Promise<{ period: { id: string; name: string } | null; requests: PeerRequestView[] }> {
  assertHr(actor)
  const period = await mappingPeriod().catch(() => null)
  if (!period) return { period: null, requests: [] }
  const requests = await prisma.peerChangeRequest.findMany({ where: { periodId: period.id }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] })
  const people = await loadPeople(requests.flatMap((r) => [r.requesterId, r.peerId, r.approverId ?? '']))
  return { period: { id: period.id, name: period.name }, requests: requests.map((r) => requestView(r, people)) }
}

/** HR's pre-evaluation step: everyone with a mapping gets their lead, team and peers, and a link to ask for peer changes. */
export async function sendMappingEmails(actor: WeeklyActor, now: Date, send: WeeklySendMail, appUrl: string): Promise<WeeklySendResult> {
  assertHr(actor)
  const period = await mappingPeriod()
  const assignments = await getResolvedEvaluationAssignments(period.id)
  const userIds = [...new Set(assignments.flatMap((a) => [a.evaluatorId, a.evaluateeId]))]
  const people = await loadPeople(userIds)
  const names = (ids: string[]) => ids.map((id) => people.get(id)?.name ?? 'Unknown').sort((a, b) => a.localeCompare(b))
  const messages: WeeklyEmailMessage[] = userIds.flatMap((userId) => {
    const person = people.get(userId)
    if (!person || isOutsideRedesign(person)) return []
    const mapping = mappingOf(userId, assignments)
    if (mapping.leads.length + mapping.reports.length + mapping.peers.length === 0) return []
    return [{
      userId, kind: 'weekly-mapping' as const, dedupeKey: `weekly-mapping:${period.id}:${userId}:${now.toISOString().slice(0, 10)}`,
      render: (name: string) => renderMappingEmail({ name, periodName: period.name, leads: names(mapping.leads), reports: names(mapping.reports), peers: names(mapping.peers), appUrl }),
    }]
  })
  const result = await deliverOnce(messages, send)
  await recordAudit(prisma, { actorId: actor.id, actorRole: 'HR', action: 'MAPPING_EMAILS', objectType: 'EvaluationPeriod', objectId: period.id, after: result })
  return result
}

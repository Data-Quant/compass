// Section 4 of HR's feedback: at the start of a quarter everyone sees their lead, team and peers and can ask to correct
// them. A peer change takes effect once that peer and the employee's lead both approve (one click each, from an email);
// a change to the employee's lead or team, and anything without a lead to approve, is HR's decision. An approved change
// is written as period overrides in both directions.
import { createHash, randomBytes } from 'node:crypto'
import type { MappingRelation, PeerChangeAction, PeerChangeRequest, PeerChangeStatus, Prisma, RelationshipType } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { renderMappingEmail, renderPeerOutcomeEmail, renderPeerRequestEmail } from '../emails'
import { isOutsideRedesign } from '../eligibility'
import type { MyMappingResponse, PeerRequestTokenView, PeerRequestView, PersonRef } from '../view-types'
import { recordAudit } from './audit'
import { assertHr, loadPeople, personRef, type WeeklyActor } from './context'
import { WeeklyError } from './errors'
import { deliverOnce, type WeeklyEmailMessage, type WeeklySendMail, type WeeklySendResult } from './notifications'
import { periodRoundStage } from './round'

export type PeerDecision = 'APPROVE' | 'REJECT'
const LOCKED = 'This quarter is locked, so its mapping can no longer change'
const NOT_IN_REVIEW = 'Lists can only be changed here during the review stage. Contact HR to change them now.'

/** Employees request changes only while the round is in its review stage (UX spec, section 6). */
async function inReview(periodId: string): Promise<boolean> {
  return (await periodRoundStage(periodId)) === 'REVIEW'
}
const base = (appUrl: string) => appUrl.replace(/\/$/, '')
const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const newToken = () => randomBytes(32).toString('base64url')

const NOT_IN_LIST: Record<MappingRelation, string> = { PEER: 'one of your peers', LEAD: 'your lead', REPORT: 'one of your team members' }

type Period = { id: string; name: string; isLocked: boolean }

/** The quarter being mapped: the one named, else the newest cycle in setup or running, else the active period. */
async function mappingPeriod(periodId?: string): Promise<Period> {
  const select = { id: true, name: true, isLocked: true } as const
  const cycle = periodId ? null : await prisma.weeklyCycle.findFirst({ where: { status: { in: ['SETUP', 'RUNNING'] } }, orderBy: { weekOneStartsOn: 'desc' }, select: { periodId: true } })
  const id = periodId ?? cycle?.periodId
  const period = id
    ? await prisma.evaluationPeriod.findUnique({ where: { id }, select })
    : await prisma.evaluationPeriod.findFirst({ where: { isActive: true }, select })
  if (!period) throw new WeeklyError('There is no quarter to map yet', 409)
  return period
}

interface Mapping { leads: string[]; reports: string[]; peers: string[]; others: string[] }

function mappingOf(userId: string, assignments: ReadonlyArray<{ evaluatorId: string; evaluateeId: string; relationshipType: string }>): Mapping {
  const ids = (list: string[]) => [...new Set(list)].filter((id) => id !== userId)
  const as = (type: string, side: 'evaluatorId' | 'evaluateeId', other: 'evaluatorId' | 'evaluateeId') =>
    assignments.filter((a) => a.relationshipType === type && a[side] === userId).map((a) => a[other])
  return {
    leads: ids([...as('TEAM_LEAD', 'evaluateeId', 'evaluatorId'), ...as('DIRECT_REPORT', 'evaluatorId', 'evaluateeId')]),
    reports: ids([...as('TEAM_LEAD', 'evaluatorId', 'evaluateeId'), ...as('DIRECT_REPORT', 'evaluateeId', 'evaluatorId')]),
    peers: ids([...as('PEER', 'evaluatorId', 'evaluateeId'), ...as('PEER', 'evaluateeId', 'evaluatorId')]),
    others: ids([...as('CROSS_DEPARTMENT', 'evaluatorId', 'evaluateeId'), ...as('CROSS_DEPARTMENT', 'evaluateeId', 'evaluatorId')]),
  }
}

const listFor = (mapping: Mapping, relation: MappingRelation) => (relation === 'PEER' ? mapping.peers : relation === 'LEAD' ? mapping.leads : mapping.reports)

async function mappingFor(periodId: string, userId: string): Promise<Mapping> {
  return mappingOf(userId, await getResolvedEvaluationAssignments(periodId))
}

function requestView(r: PeerChangeRequest, people: ReadonlyMap<string, { name: string; position: string | null }>): PeerRequestView {
  return {
    id: r.id, action: r.action, relation: r.relation, status: r.status, reason: r.reason, createdAt: r.createdAt.toISOString(),
    requester: personRef(people, r.requesterId), peer: personRef(people, r.peerId),
    approver: r.approverId ? personRef(people, r.approverId) : null, peerVote: r.peerVote, approverVote: r.approverVote,
  }
}

export async function myMapping(actor: WeeklyActor, now: Date): Promise<MyMappingResponse> {
  void now
  const period = await mappingPeriod()
  const mapping = await mappingFor(period.id, actor.id)
  const requests = await prisma.peerChangeRequest.findMany({ where: { periodId: period.id, requesterId: actor.id }, orderBy: { createdAt: 'desc' } })
  const pending = requests.filter((r) => r.status === 'PENDING').map((r) => r.peerId)
  const candidates = await prisma.user.findMany({
    where: { id: { notIn: [actor.id, ...mapping.peers, ...mapping.leads, ...mapping.reports, ...pending] }, OR: [{ payrollProfile: null }, { payrollProfile: { isPayrollActive: true } }] },
    select: { id: true, name: true, position: true, department: true },
    orderBy: { name: 'asc' },
  })
  const people = await loadPeople([...mapping.leads, ...mapping.reports, ...mapping.peers, ...requests.flatMap((r) => [r.requesterId, r.peerId, r.approverId ?? ''])])
  const refs = (ids: string[]): PersonRef[] => ids.map((id) => personRef(people, id)).sort((a, b) => a.name.localeCompare(b.name))
  return {
    period: { id: period.id, name: period.name, locked: period.isLocked || !(await inReview(period.id)) },
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
  actor: WeeklyActor,
  input: { peerId: string; action: PeerChangeAction; relation?: MappingRelation; reason?: string | null },
  now: Date, send: WeeklySendMail, appUrl: string,
): Promise<PeerRequestView> {
  const relation = input.relation ?? 'PEER'
  const period = await mappingPeriod()
  if (period.isLocked) throw new WeeklyError(LOCKED, 409)
  if (!(await inReview(period.id))) throw new WeeklyError(NOT_IN_REVIEW, 409)
  if (input.peerId === actor.id) throw new WeeklyError('You cannot add or remove yourself')
  const other = (await loadPeople([input.peerId])).get(input.peerId)
  if (!other || !other.payrollActive || isOutsideRedesign(other)) throw new WeeklyError('Person not found', 404)
  const mapping = await mappingFor(period.id, actor.id)
  if (input.action === 'REMOVE' && !listFor(mapping, relation).includes(input.peerId)) throw new WeeklyError(`${other.name} is not ${NOT_IN_LIST[relation]} this quarter`)
  if (input.action === 'ADD' && [...mapping.peers, ...mapping.leads, ...mapping.reports, ...mapping.others].includes(input.peerId)) throw new WeeklyError(`${other.name} is already in your mapping this quarter`)
  // A peer change: the peer and the lead approve (HR when there is no other lead). A lead or team change: HR decides.
  const approverId = relation === 'PEER' ? mapping.leads.find((id) => id !== input.peerId) ?? null : null
  const tokens = relation === 'PEER' ? { peer: newToken(), approver: approverId ? newToken() : null } : null
  const pairLock = [actor.id, input.peerId].sort().join(':')
  const request = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`peer-request:${period.id}:${pairLock}`}))::text`
    const pending = await tx.peerChangeRequest.count({
      where: { periodId: period.id, status: 'PENDING', OR: [{ requesterId: actor.id, peerId: input.peerId }, { requesterId: input.peerId, peerId: actor.id }] },
    })
    if (pending > 0) throw new WeeklyError('There is already a request about this person waiting for a decision', 409)
    return tx.peerChangeRequest.create({
      data: {
        periodId: period.id, requesterId: actor.id, peerId: input.peerId, action: input.action, relation, reason: input.reason?.trim() || null,
        peerTokenHash: tokens ? hash(tokens.peer) : null, approverId, approverTokenHash: tokens?.approver ? hash(tokens.approver) : null,
      },
    })
  })
  await recordAudit(prisma, { actorId: actor.id, actorRole: 'EMPLOYEE', action: 'MAPPING_REQUEST', objectType: 'PeerChangeRequest', objectId: request.id, after: { action: input.action, relation, peerId: input.peerId } })
  if (tokens) await deliverOnce(approvalMessages(request, tokens, { requester: actor.name, peer: other.name }, period.name, appUrl), send)
  const people = await loadPeople([actor.id, input.peerId, approverId ?? ''])
  return requestView(request, people)
}

export async function cancelPeerRequest(actor: WeeklyActor, requestId: string): Promise<void> {
  const cancelled = await prisma.peerChangeRequest.updateMany({ where: { id: requestId, requesterId: actor.id, status: 'PENDING' }, data: { status: 'CANCELLED' } })
  if (cancelled.count === 0) throw new WeeklyError('Request not found', 404)
}

/** The period overrides for a change, both directions: peers evaluate each other; a lead and their report evaluate each other. */
function overridesFor(request: PeerChangeRequest): Array<{ evaluatorId: string; evaluateeId: string; relationshipType: RelationshipType }> {
  const me = request.requesterId
  const them = request.peerId
  switch (request.relation) {
    case 'PEER':
      return [{ evaluatorId: me, evaluateeId: them, relationshipType: 'PEER' }, { evaluatorId: them, evaluateeId: me, relationshipType: 'PEER' }]
    case 'LEAD':
      return [{ evaluatorId: them, evaluateeId: me, relationshipType: 'TEAM_LEAD' }, { evaluatorId: me, evaluateeId: them, relationshipType: 'DIRECT_REPORT' }]
    case 'REPORT':
      return [{ evaluatorId: me, evaluateeId: them, relationshipType: 'TEAM_LEAD' }, { evaluatorId: them, evaluateeId: me, relationshipType: 'DIRECT_REPORT' }]
  }
}

async function applyChange(tx: Prisma.TransactionClient, request: PeerChangeRequest, decidedById: string | null): Promise<void> {
  for (const pair of overridesFor(request)) {
    const key = { periodId: request.periodId, ...pair }
    await tx.evaluationPeriodAssignmentOverride.upsert({
      where: { periodId_evaluatorId_evaluateeId_relationshipType: key },
      create: { ...key, action: request.action, note: `Mapping request ${request.id}`, createdById: decidedById },
      update: { action: request.action, note: `Mapping request ${request.id}` },
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
  // The status change and both overrides commit together, so an approved request is always fully applied.
  const moved = await prisma.$transaction(async (tx) => {
    const updated = await tx.peerChangeRequest.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: { status, decidedAt: now, ...(hrDecision ? { decidedById: hrDecision.by } : {}) },
    })
    if (updated.count > 0 && approved) await applyChange(tx, request, hrDecision?.by ?? null)
    return updated.count
  })
  if (moved === 0) {
    // Someone else settled it at the same moment (both approvers, or HR): that is not an error for a vote.
    if (hrDecision) throw new WeeklyError('This request was already decided', 409)
    return (await prisma.peerChangeRequest.findUniqueOrThrow({ where: { id: requestId }, select: { status: true } })).status
  }
  const other = (await loadPeople([request.peerId])).get(request.peerId)
  await deliverOnce([{
    userId: request.requesterId, kind: 'peer-request-outcome', dedupeKey: `peer-request-outcome:${request.id}`,
    render: (name) => renderPeerOutcomeEmail({ name, peerName: other?.name ?? 'the person', action: request.action, relation: request.relation, approved, appUrl }),
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
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: request.periodId }, select: { isLocked: true } })
  const closed = await prisma.weeklyCycle.count({ where: { periodId: request.periodId, status: 'CLOSED' } })
  if (period?.isLocked || closed > 0) throw new WeeklyError(LOCKED, 409)
  if (!(await inReview(request.periodId))) throw new WeeklyError('The round has started, so this request can no longer be answered', 409)
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
  await recordAudit(prisma, { actorId: actor.id, actorRole: 'HR', action: `MAPPING_DECIDE_${decision}`, objectType: 'PeerChangeRequest', objectId: requestId })
  return { status }
}

/** New links for the votes still open on a peer request; the old links stop working. */
export async function resendPeerRequestLinks(actor: WeeklyActor, requestId: string, now: Date, send: WeeklySendMail, appUrl: string): Promise<WeeklySendResult> {
  assertHr(actor)
  const request = await prisma.peerChangeRequest.findUnique({ where: { id: requestId } })
  if (!request || request.status !== 'PENDING' || request.relation !== 'PEER') throw new WeeklyError('Only a peer request waiting for approval has links to resend', 409)
  const tokens = { peer: newToken(), approver: request.approverId ? newToken() : null }
  const updated = await prisma.peerChangeRequest.update({
    where: { id: requestId },
    data: { peerTokenHash: hash(tokens.peer), ...(tokens.approver ? { approverTokenHash: hash(tokens.approver) } : {}) },
  })
  const people = await loadPeople([request.requesterId, request.peerId])
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: request.periodId }, select: { name: true } })
  const open = approvalMessages(updated, tokens, { requester: people.get(request.requesterId)?.name ?? '', peer: people.get(request.peerId)?.name ?? '' }, period?.name ?? '', appUrl)
    .filter((m) => (m.userId === request.peerId ? request.peerVote : request.approverVote) === 'PENDING')
    .map((m) => ({ ...m, dedupeKey: `${m.dedupeKey}:${hash(tokens.peer).slice(0, 12)}` }))
  await recordAudit(prisma, { actorId: actor.id, actorRole: 'HR', action: 'PEER_RESEND', objectType: 'PeerChangeRequest', objectId: requestId })
  return deliverOnce(open, send)
}

export async function adminPeerRequests(actor: WeeklyActor): Promise<{ period: { id: string; name: string } | null; requests: PeerRequestView[] }> {
  assertHr(actor)
  const period = await mappingPeriod().catch(() => null)
  if (!period) return { period: null, requests: [] }
  const requests = await prisma.peerChangeRequest.findMany({ where: { periodId: period.id }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] })
  const people = await loadPeople(requests.flatMap((r) => [r.requesterId, r.peerId, r.approverId ?? '']))
  return { period: { id: period.id, name: period.name }, requests: requests.map((r) => requestView(r, people)) }
}

/** HR's pre-evaluation step: everyone with a mapping gets their lead, team and peers, and a link to ask for changes. */
export async function sendMappingEmails(actor: WeeklyActor, now: Date, send: WeeklySendMail, appUrl: string, periodId?: string): Promise<WeeklySendResult> {
  assertHr(actor)
  const period = await mappingPeriod(periodId)
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

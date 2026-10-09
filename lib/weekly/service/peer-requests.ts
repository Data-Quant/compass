// UX spec, section 6, with HR's rule: during a round's review stage everyone sees their lead, team and peers, says they
// look right or asks to correct them. A request from someone with a lead goes to that lead to review first (a link in an
// email); HR then decides every change, whatever the lead said. Someone with no lead goes straight to HR. For a peer
// change the peer is told and may reply. An approved change is written as period overrides in both directions.
import { createHash, randomBytes } from 'node:crypto'
import type {
  MappingReasonCode, MappingRelation, PeerChangeAction, PeerChangeRequest, PeerChangeStatus, PeerReply, Prisma, RelationshipType,
} from '@prisma/client'
import { prisma } from '@/lib/db'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import {
  renderChangeForOtherEmail, renderMappingEmail, renderMappingQuestionEmail, renderPeerOutcomeEmail, renderPeerReplyEmail, renderPeerRequestEmail, renderRequestForHrEmail,
  renderRequestReceivedEmail,
} from '../emails'
import { isOutsideRedesign } from '../eligibility'
import { formatKarachiDate } from '../format'
import { OPEN_REQUEST_STATUSES } from '../request-status'
import type { MyMappingResponse, PeerRequestTokenView, PeerRequestView, PersonRef } from '../view-types'
import { addWorkingDays } from '../working-days'
import { recordAudit } from './audit'
import { assertHr, loadPeople, personRef, type WeeklyActor } from './context'
import { WeeklyError } from './errors'
import { deliverOnce, deliverSafely, hrUserIds, type WeeklyEmailMessage, type WeeklySendMail, type WeeklySendResult } from './notifications'
import { periodRoundStage } from './round'

export type PeerDecision = 'APPROVE' | 'REJECT'
export type HrDecision = PeerDecision | 'NEEDS_INFO'
/** Someone with fewer peers than this is flagged to HR, and a removal that leaves them so is warned about. */
export const MIN_PEERS = 2
/** A lead who has not decided a peer change after this many working days is reminded, and HR sees it flagged. */
export const LEAD_DECISION_WORKING_DAYS = 2
const OPEN_STATUSES = OPEN_REQUEST_STATUSES
const LOCKED = 'This quarter is locked, so its mapping can no longer change'
const NOT_IN_REVIEW = 'Lists can only be changed here during the review stage. Contact HR to change them now.'

/** Employees request changes only while the round is in its review stage (UX spec, section 6). */
async function inReview(periodId: string): Promise<boolean> {
  return (await periodRoundStage(periodId)) === 'REVIEW'
}
const base = (appUrl: string) => appUrl.replace(/\/$/, '')
const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const newToken = () => randomBytes(32).toString('base64url')
const required = (text: string | null | undefined, message: string): string => {
  const trimmed = text?.trim() ?? ''
  if (!trimmed) throw new WeeklyError(message)
  return trimmed
}

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

export interface Mapping { leads: string[]; reports: string[]; peers: string[]; others: string[] }

export function mappingOf(userId: string, assignments: ReadonlyArray<{ evaluatorId: string; evaluateeId: string; relationshipType: string }>): Mapping {
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

/** Waiting on a lead who has already been reminded: HR sees it flagged. */
const isOverdue = (r: PeerChangeRequest) => r.status === 'PENDING' && r.approverVote === 'PENDING' && r.remindedAt !== null

/** Who has it now: the lead (to review), HR (to decide), the requester (to answer HR), or nobody (done). */
function stageOf(r: PeerChangeRequest): PeerRequestView['stage'] {
  if (r.status === 'NEEDS_INFO') return 'REQUESTER'
  if (r.status !== 'PENDING') return 'DONE'
  return r.approverId && r.approverVote === 'PENDING' ? 'LEAD' : 'HR'
}

function requestView(r: PeerChangeRequest, people: ReadonlyMap<string, { name: string; position: string | null }>): PeerRequestView {
  return {
    id: r.id, action: r.action, relation: r.relation, status: r.status, reasonCode: r.reasonCode, reason: r.reason, decisionNote: r.decisionNote, answer: r.answer,
    createdAt: r.createdAt.toISOString(), requester: personRef(people, r.requesterId), peer: personRef(people, r.peerId),
    approver: r.approverId ? personRef(people, r.approverId) : null, peerReply: r.peerReply, approverVote: r.approverVote, leadNote: r.leadNote,
    stage: stageOf(r), overdue: isOverdue(r),
  }
}

export async function myMapping(actor: WeeklyActor, now: Date): Promise<MyMappingResponse> {
  void now
  const period = await mappingPeriod()
  const mapping = await mappingFor(period.id, actor.id)
  const requests = await prisma.peerChangeRequest.findMany({ where: { periodId: period.id, requesterId: actor.id }, orderBy: { createdAt: 'desc' } })
  const open = requests.filter((r) => OPEN_STATUSES.includes(r.status)).map((r) => r.peerId)
  const candidates = await prisma.user.findMany({
    where: { id: { notIn: [actor.id, ...mapping.peers, ...mapping.leads, ...mapping.reports, ...open] }, OR: [{ payrollProfile: null }, { payrollProfile: { isPayrollActive: true } }] },
    select: { id: true, name: true, position: true, department: true },
    orderBy: { name: 'asc' },
  })
  const confirmation = await prisma.mappingConfirmation.findUnique({ where: { periodId_userId: { periodId: period.id, userId: actor.id } } })
  const people = await loadPeople([...mapping.leads, ...mapping.reports, ...mapping.peers, ...requests.flatMap((r) => [r.requesterId, r.peerId, r.approverId ?? ''])])
  const refs = (ids: string[]): PersonRef[] => ids.map((id) => personRef(people, id)).sort((a, b) => a.name.localeCompare(b.name))
  return {
    period: { id: period.id, name: period.name, locked: period.isLocked || !(await inReview(period.id)) },
    leads: refs(mapping.leads), reports: refs(mapping.reports), peers: refs(mapping.peers),
    requests: requests.map((r) => requestView(r, people)),
    candidates: candidates.filter((c) => !isOutsideRedesign(c)).map((c) => ({ id: c.id, name: c.name, position: c.position })),
    confirmedAt: confirmation?.confirmedAt.toISOString() ?? null,
  }
}

/** "My lists look right", during the review stage. Saying it again changes nothing. */
export async function confirmMyLists(actor: WeeklyActor, now: Date): Promise<{ confirmedAt: string }> {
  const period = await mappingPeriod()
  if (period.isLocked) throw new WeeklyError(LOCKED, 409)
  if (!(await inReview(period.id))) throw new WeeklyError(NOT_IN_REVIEW, 409)
  const key = { periodId: period.id, userId: actor.id }
  const row = await prisma.mappingConfirmation.upsert({ where: { periodId_userId: key }, create: { ...key, confirmedAt: now }, update: {} })
  return { confirmedAt: row.confirmedAt.toISOString() }
}

type Tokens = { peer: string | null; approver: string | null }

function linkMessages(request: PeerChangeRequest, tokens: Tokens, names: { requester: string; peer: string }, periodName: string, appUrl: string): WeeklyEmailMessage[] {
  const message = (userId: string, role: 'PEER' | 'LEAD', token: string): WeeklyEmailMessage => ({
    userId, kind: 'peer-request', dedupeKey: `peer-request:${request.id}:${userId}`,
    render: (name) => renderPeerRequestEmail({ name, requesterName: names.requester, peerName: names.peer, action: request.action, relation: request.relation, role, periodName, link: `${base(appUrl)}/peer-requests/${token}` }),
  })
  return [
    ...(tokens.peer ? [message(request.peerId, 'PEER', tokens.peer)] : []),
    ...(request.approverId && tokens.approver ? [message(request.approverId, 'LEAD', tokens.approver)] : []),
  ]
}

export async function requestPeerChange(
  actor: WeeklyActor,
  input: { peerId: string; action: PeerChangeAction; relation?: MappingRelation; reasonCode?: MappingReasonCode | null; reason?: string | null },
  now: Date, send: WeeklySendMail, appUrl: string,
): Promise<PeerRequestView> {
  const relation = input.relation ?? 'PEER'
  const period = await mappingPeriod()
  if (period.isLocked) throw new WeeklyError(LOCKED, 409)
  if (!(await inReview(period.id))) throw new WeeklyError(NOT_IN_REVIEW, 409)
  if (input.peerId === actor.id) throw new WeeklyError('You cannot add or remove yourself')
  // Removing a peer says why; "Other" says it in words.
  const removingPeer = relation === 'PEER' && input.action === 'REMOVE'
  const reasonCode = removingPeer ? input.reasonCode ?? null : null
  if (removingPeer && !reasonCode) throw new WeeklyError('Choose a reason for removing this peer')
  if (reasonCode === 'OTHER') required(input.reason, 'Write a reason for removing this peer')
  const other = (await loadPeople([input.peerId])).get(input.peerId)
  if (!other || !other.payrollActive || isOutsideRedesign(other)) throw new WeeklyError('Person not found', 404)
  const mapping = await mappingFor(period.id, actor.id)
  if (input.action === 'REMOVE' && !listFor(mapping, relation).includes(input.peerId)) throw new WeeklyError(`${other.name} is not ${NOT_IN_LIST[relation]} this quarter`)
  if (input.action === 'ADD' && [...mapping.peers, ...mapping.leads, ...mapping.reports, ...mapping.others].includes(input.peerId)) throw new WeeklyError(`${other.name} is already in your mapping this quarter`)
  // Their lead reviews it first, unless the change is about that lead; with no other lead it goes straight to HR. The peer
  // in a peer change is told.
  const approverId = mapping.leads.find((id) => id !== input.peerId) ?? null
  const tokens: Tokens = { peer: relation === 'PEER' ? newToken() : null, approver: approverId ? newToken() : null }
  const pairLock = [actor.id, input.peerId].sort().join(':')
  const request = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`peer-request:${period.id}:${pairLock}`}))::text`
    const open = await tx.peerChangeRequest.count({
      where: { periodId: period.id, status: { in: OPEN_STATUSES }, OR: [{ requesterId: actor.id, peerId: input.peerId }, { requesterId: input.peerId, peerId: actor.id }] },
    })
    if (open > 0) throw new WeeklyError('There is already a request about this person waiting for a decision', 409)
    return tx.peerChangeRequest.create({
      data: {
        periodId: period.id, requesterId: actor.id, peerId: input.peerId, action: input.action, relation, reasonCode, reason: input.reason?.trim() || null, createdAt: now,
        peerTokenHash: tokens.peer ? hash(tokens.peer) : null, approverId, approverTokenHash: tokens.approver ? hash(tokens.approver) : null,
      },
    })
  })
  // Asking for a change means the lists did not look right after all.
  await prisma.mappingConfirmation.deleteMany({ where: { periodId: period.id, userId: actor.id } })
  await recordAudit(prisma, { actorId: actor.id, actorRole: 'EMPLOYEE', action: 'MAPPING_REQUEST', objectType: 'PeerChangeRequest', objectId: request.id, after: { action: input.action, relation, peerId: input.peerId } })
  const people = await loadPeople([actor.id, input.peerId, approverId ?? ''])
  // A lead or team change is confirmed by email (UX spec, section 13); a peer change shows its progress on the page.
  const received: WeeklyEmailMessage[] = relation === 'PEER' ? [] : [{
    userId: actor.id, kind: 'peer-request-received', dedupeKey: `peer-request-received:${request.id}`,
    render: (name) => renderRequestReceivedEmail({ name, otherName: other.name, action: input.action, relation, leadName: approverId ? people.get(approverId)?.name ?? null : null, appUrl }),
  }]
  await deliverSafely('mapping request', async () => [
    ...linkMessages(request, tokens, { requester: actor.name, peer: other.name }, period.name, appUrl),
    ...received,
    ...(approverId ? [] : await hrMessages(request, appUrl)),
  ], send)
  return requestView(request, people)
}

/** HR is emailed once when a request becomes theirs to decide: at once with no lead to review it, or after the lead has. */
async function hrMessages(request: PeerChangeRequest, appUrl: string): Promise<WeeklyEmailMessage[]> {
  const people = await loadPeople([request.requesterId, request.peerId, request.approverId ?? ''])
  const name = (id: string) => people.get(id)?.name ?? 'Someone'
  const lead = request.approverId && request.approverVote !== 'PENDING'
    ? { name: name(request.approverId), agrees: request.approverVote === 'APPROVED', note: request.leadNote }
    : null
  return (await hrUserIds()).map((userId) => ({
    userId, kind: 'peer-request-for-hr' as const, dedupeKey: `peer-request-for-hr:${request.id}:${userId}`,
    render: (to: string) => renderRequestForHrEmail({ name: to, requesterName: name(request.requesterId), otherName: name(request.peerId), action: request.action, relation: request.relation, lead, appUrl }),
  }))
}

export async function cancelPeerRequest(actor: WeeklyActor, requestId: string): Promise<void> {
  const cancelled = await prisma.peerChangeRequest.updateMany({ where: { id: requestId, requesterId: actor.id, status: { in: OPEN_STATUSES } }, data: { status: 'CANCELLED' } })
  if (cancelled.count === 0) throw new WeeklyError('Request not found', 404)
}

/** The requester answers HR's question; the request goes back to HR with the original reason kept. */
export async function answerPeerRequest(actor: WeeklyActor, requestId: string, reason: string): Promise<PeerRequestView> {
  const text = required(reason, 'Write your answer')
  const request = await prisma.peerChangeRequest.findFirst({ where: { id: requestId, requesterId: actor.id, status: 'NEEDS_INFO' } })
  if (!request) throw new WeeklyError('Request not found', 404)
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: request.periodId }, select: { isLocked: true } })
  if (period?.isLocked) throw new WeeklyError(LOCKED, 409)
  const moved = await prisma.peerChangeRequest.updateMany({ where: { id: requestId, status: 'NEEDS_INFO' }, data: { status: 'PENDING', answer: text, decisionNote: null } })
  if (moved.count === 0) throw new WeeklyError('This request was already decided', 409)
  const updated = await prisma.peerChangeRequest.findUniqueOrThrow({ where: { id: requestId } })
  return requestView(updated, await loadPeople([updated.requesterId, updated.peerId, updated.approverId ?? '']))
}

/** The period overrides for a change, both directions: peers evaluate each other; a lead and their report evaluate each other. */
function overridesFor(relation: MappingRelation, me: string, them: string): Array<{ evaluatorId: string; evaluateeId: string; relationshipType: RelationshipType }> {
  switch (relation) {
    case 'PEER':
      return [{ evaluatorId: me, evaluateeId: them, relationshipType: 'PEER' }, { evaluatorId: them, evaluateeId: me, relationshipType: 'PEER' }]
    case 'LEAD':
      return [{ evaluatorId: them, evaluateeId: me, relationshipType: 'TEAM_LEAD' }, { evaluatorId: me, evaluateeId: them, relationshipType: 'DIRECT_REPORT' }]
    case 'REPORT':
      return [{ evaluatorId: me, evaluateeId: them, relationshipType: 'TEAM_LEAD' }, { evaluatorId: them, evaluateeId: me, relationshipType: 'DIRECT_REPORT' }]
  }
}

/** Writes a change to someone's lists for one quarter, as overrides in both directions. */
export async function applyMappingChange(
  tx: Prisma.TransactionClient,
  input: { periodId: string; userId: string; otherId: string; relation: MappingRelation; action: PeerChangeAction; note: string; by: string | null },
): Promise<void> {
  for (const pair of overridesFor(input.relation, input.userId, input.otherId)) {
    const key = { periodId: input.periodId, ...pair }
    await tx.evaluationPeriodAssignmentOverride.upsert({
      where: { periodId_evaluatorId_evaluateeId_relationshipType: key },
      create: { ...key, action: input.action, note: input.note, createdById: input.by },
      update: { action: input.action, note: input.note },
    })
  }
}

function applyChange(tx: Prisma.TransactionClient, request: PeerChangeRequest, decidedById: string | null): Promise<void> {
  return applyMappingChange(tx, {
    periodId: request.periodId, userId: request.requesterId, otherId: request.peerId, relation: request.relation, action: request.action,
    note: `Mapping request ${request.id}`, by: decidedById,
  })
}

/**
 * HR decides a request. The status change and both overrides commit together, so an approved request is always fully
 * applied; if HR decided it at the same moment elsewhere, nothing changes and null comes back.
 */
async function decide(request: PeerChangeRequest, approved: boolean, note: string | null, now: Date, send: WeeklySendMail, appUrl: string, hrId: string): Promise<PeerChangeStatus | null> {
  const status: PeerChangeStatus = approved ? 'APPROVED' : 'REJECTED'
  const moved = await prisma.$transaction(async (tx) => {
    const updated = await tx.peerChangeRequest.updateMany({
      where: { id: request.id, status: { in: OPEN_STATUSES } },
      data: { status, decidedAt: now, decisionNote: note, decidedById: hrId },
    })
    if (updated.count > 0 && approved) await applyChange(tx, request, hrId)
    return updated.count
  })
  if (moved === 0) return null
  const people = await loadPeople([request.peerId, request.requesterId])
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: request.periodId }, select: { name: true } })
  const name = (id: string) => people.get(id)?.name ?? 'the person'
  // A peer hears either way, as they were told about the request; a lead or team member hears once it is applied.
  const tellOther = request.relation === 'PEER' || approved
  await deliverSafely('mapping decision', () => [
    {
      userId: request.requesterId, kind: 'peer-request-outcome', dedupeKey: `peer-request-outcome:${request.id}`,
      render: (to) => renderPeerOutcomeEmail({ name: to, peerName: name(request.peerId), action: request.action, relation: request.relation, approved, note, appUrl }),
    },
    ...(tellOther ? [{
      userId: request.peerId, kind: 'peer-request-outcome' as const, dedupeKey: `peer-request-outcome:${request.id}:other`,
      render: (to: string) => renderChangeForOtherEmail({ name: to, requesterName: name(request.requesterId), periodName: period?.name ?? 'this quarter', action: request.action, relation: request.relation, approved, note, appUrl }),
    }] : []),
  ], send)
  return status
}

async function findByToken(token: string): Promise<{ request: PeerChangeRequest; role: 'PEER' | 'LEAD' }> {
  const hashed = hash(token)
  const request = await prisma.peerChangeRequest.findFirst({ where: { OR: [{ peerTokenHash: hashed }, { approverTokenHash: hashed }] } })
  if (!request) throw new WeeklyError('This link is not valid', 404)
  return { request, role: request.peerTokenHash === hashed ? 'PEER' : 'LEAD' }
}

/** Links work only while the quarter is open and its round is still in review. */
async function assertLinkOpen(periodId: string): Promise<void> {
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: periodId }, select: { isLocked: true } })
  const closed = await prisma.weeklyCycle.count({ where: { periodId, status: 'CLOSED' } })
  if (period?.isLocked || closed > 0) throw new WeeklyError(LOCKED, 409)
  if (!(await inReview(periodId))) throw new WeeklyError('The round has started, so this request can no longer be answered', 409)
}

export async function peerRequestByToken(token: string): Promise<PeerRequestTokenView> {
  const { request, role } = await findByToken(token)
  const people = await loadPeople([request.requesterId, request.peerId])
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: request.periodId }, select: { name: true } })
  const peers = (await mappingFor(request.periodId, request.requesterId)).peers.length
  return {
    requester: personRef(people, request.requesterId), peer: personRef(people, request.peerId), action: request.action, relation: request.relation, role, status: request.status,
    vote: request.approverVote, peerReply: request.peerReply, periodName: period?.name ?? '',
    // Why they asked is for the lead who decides, never for the peer it is about.
    reasonCode: role === 'LEAD' ? request.reasonCode : null, reason: role === 'LEAD' ? request.reason : null,
    peersLeft: request.status === 'PENDING' ? peers + (request.action === 'ADD' ? 1 : -1) : peers,
  }
}

/** The lead's review from the email link: agree, or disagree with a reason. It goes to HR either way; HR decides. */
export async function voteOnPeerRequest(token: string, decision: PeerDecision, note: string | null | undefined, now: Date, send: WeeklySendMail, appUrl: string): Promise<{ status: PeerChangeStatus }> {
  const { request, role } = await findByToken(token)
  if (role !== 'LEAD') throw new WeeklyError('Only their lead reviews this change', 403)
  await assertLinkOpen(request.periodId)
  const leadNote = decision === 'REJECT' ? required(note, 'Give a reason for disagreeing') : note?.trim() || null
  const vote = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'
  // Guarded, so a second click, HR's decision or HR's open question changes nothing.
  const reviewed = await prisma.peerChangeRequest.updateMany({
    where: { id: request.id, status: 'PENDING', approverVote: 'PENDING' },
    data: { approverVote: vote, approverVotedAt: now, leadNote },
  })
  if (reviewed.count === 0) {
    const current = await prisma.peerChangeRequest.findUniqueOrThrow({ where: { id: request.id }, select: { status: true } })
    throw new WeeklyError(current.status === 'NEEDS_INFO' ? 'HR has asked a question about this request; you can review it once that is answered' : 'This request was already reviewed', 409)
  }
  await recordAudit(prisma, { actorId: request.approverId, actorRole: 'LEAD', action: `MAPPING_LEAD_${vote}`, objectType: 'PeerChangeRequest', objectId: request.id })
  await deliverSafely('mapping review', async () => hrMessages(await prisma.peerChangeRequest.findUniqueOrThrow({ where: { id: request.id } }), appUrl), send)
  return { status: 'PENDING' }
}

/** The peer's optional reply from their link. It can change while the request is open and never decides it; the lead and HR hear each new answer. */
export async function replyToPeerRequest(token: string, reply: PeerReply, now: Date, send: WeeklySendMail, appUrl: string): Promise<void> {
  const { request, role } = await findByToken(token)
  if (role !== 'PEER') throw new WeeklyError('This link is for deciding the request, not replying to it', 403)
  await assertLinkOpen(request.periodId)
  const updated = await prisma.peerChangeRequest.updateMany({ where: { id: request.id, status: { in: OPEN_STATUSES } }, data: { peerReply: reply, peerRepliedAt: now } })
  if (updated.count === 0) throw new WeeklyError('This request was already decided', 409)
  await recordAudit(prisma, { actorId: request.peerId, actorRole: 'PEER', action: `PEER_REPLY_${reply}`, objectType: 'PeerChangeRequest', objectId: request.id })
  if (request.peerReply === reply) return
  const people = await loadPeople([request.requesterId, request.peerId])
  const names = { peerName: people.get(request.peerId)?.name ?? 'The peer', requesterName: people.get(request.requesterId)?.name ?? 'the requester' }
  const message = (userId: string, forHr: boolean): WeeklyEmailMessage => ({
    // Keyed by the moment of the reply, so changing back to an earlier answer is heard too.
    userId, kind: 'peer-request-reply', dedupeKey: `peer-request-reply:${request.id}:${now.getTime()}:${userId}`,
    render: (name) => renderPeerReplyEmail({ name, ...names, worksTogether: reply === 'WORK_TOGETHER', forHr, appUrl }),
  })
  await deliverSafely('peer reply', async () => [...(request.approverId ? [message(request.approverId, false)] : []), ...(await hrUserIds()).map((id) => message(id, true))], send)
}

/** HR applies a request, declines it with a reason, or asks the requester a question. */
export async function decidePeerRequest(actor: WeeklyActor, requestId: string, decision: HrDecision, note: string | null | undefined, now: Date, send: WeeklySendMail, appUrl: string): Promise<{ status: PeerChangeStatus }> {
  assertHr(actor)
  const request = await prisma.peerChangeRequest.findUnique({ where: { id: requestId } })
  if (!request) throw new WeeklyError('Request not found', 404)
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: request.periodId }, select: { isLocked: true } })
  if (period?.isLocked) throw new WeeklyError(LOCKED, 409)
  const audit = () => recordAudit(prisma, { actorId: actor.id, actorRole: 'HR', action: `MAPPING_DECIDE_${decision}`, objectType: 'PeerChangeRequest', objectId: requestId })
  if (decision === 'NEEDS_INFO') {
    const asked = await askRequester(request, required(note, 'Write the question for them'), send, appUrl)
    await audit()
    return asked
  }
  const reason = decision === 'REJECT' ? required(note, 'Give a reason for declining') : null
  const status = await decide(request, decision === 'APPROVE', reason, now, send, appUrl, actor.id)
  if (!status) throw new WeeklyError('This request was already decided', 409)
  await audit()
  return { status }
}

async function askRequester(request: PeerChangeRequest, question: string, send: WeeklySendMail, appUrl: string): Promise<{ status: PeerChangeStatus }> {
  const moved = await prisma.peerChangeRequest.updateMany({ where: { id: request.id, status: { in: OPEN_STATUSES } }, data: { status: 'NEEDS_INFO', decisionNote: question } })
  if (moved.count === 0) throw new WeeklyError('This request was already decided', 409)
  const other = (await loadPeople([request.peerId])).get(request.peerId)
  await deliverOnce([{
    userId: request.requesterId, kind: 'peer-request-question', dedupeKey: `peer-request-question:${request.id}:${hash(question).slice(0, 12)}`,
    render: (name) => renderMappingQuestionEmail({ name, otherName: other?.name ?? 'the person', question, appUrl }),
  }], send)
  return { status: 'NEEDS_INFO' }
}

/** New links for a request still open (the lead's, and the peer's in a peer change); the old ones stop working. */
export async function resendPeerRequestLinks(actor: WeeklyActor, requestId: string, now: Date, send: WeeklySendMail, appUrl: string): Promise<WeeklySendResult> {
  assertHr(actor)
  const request = await prisma.peerChangeRequest.findUnique({ where: { id: requestId } })
  const hasLinks = request && (request.relation === 'PEER' || request.approverId)
  if (!request || request.status !== 'PENDING' || !hasLinks) throw new WeeklyError('Only a request waiting for a review has links to resend', 409)
  const result = await sendFreshLinks(request, { peer: request.relation === 'PEER', lead: request.approverVote === 'PENDING' }, send, appUrl, `resend-${now.getTime()}`, false)
  await recordAudit(prisma, { actorId: actor.id, actorRole: 'HR', action: 'PEER_RESEND', objectType: 'PeerChangeRequest', objectId: requestId })
  return result
}

/** Replaces the links named and emails them; a link not replaced keeps working. */
async function sendFreshLinks(request: PeerChangeRequest, which: { peer: boolean; lead: boolean }, send: WeeklySendMail, appUrl: string, key: string, reminder: boolean): Promise<WeeklySendResult> {
  const tokens: Tokens = { peer: which.peer ? newToken() : null, approver: request.approverId && which.lead ? newToken() : null }
  const updated = await prisma.peerChangeRequest.update({
    where: { id: request.id },
    data: { ...(tokens.peer ? { peerTokenHash: hash(tokens.peer) } : {}), ...(tokens.approver ? { approverTokenHash: hash(tokens.approver) } : {}) },
  })
  const people = await loadPeople([request.requesterId, request.peerId])
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: request.periodId }, select: { name: true } })
  const names = { requester: people.get(request.requesterId)?.name ?? '', peer: people.get(request.peerId)?.name ?? '' }
  const messages = linkMessages(updated, tokens, names, period?.name ?? '', appUrl)
    .filter((m) => (m.userId === request.peerId ? which.peer : which.lead))
    .map((m) => ({
      ...m, dedupeKey: `${m.dedupeKey}:${key}`,
      ...(reminder ? { render: (name: string) => renderPeerRequestEmail({ name, requesterName: names.requester, peerName: names.peer, action: request.action, relation: request.relation, role: 'LEAD', periodName: period?.name ?? '', link: `${base(appUrl)}/peer-requests/${tokens.approver}`, reminder: true }) } : {}),
    }))
  return deliverOnce(messages, send)
}

/**
 * Daily: a lead who has not reviewed a request within 2 working days gets one reminder with a fresh link, and the
 * request is flagged to HR. Only rounds still in review, since requests expire when the round opens.
 */
export async function remindStaleMappingRequests(now: Date, send: WeeklySendMail, appUrl: string): Promise<WeeklySendResult> {
  const waiting = await prisma.peerChangeRequest.findMany({ where: { status: 'PENDING', approverId: { not: null }, approverVote: 'PENDING', remindedAt: null } })
  const due = waiting.filter((r) => addWorkingDays(r.createdAt, LEAD_DECISION_WORKING_DAYS, []).getTime() < now.getTime())
  let total: WeeklySendResult = { sent: 0, recorded: 0, skipped: 0, failed: 0 }
  for (const request of due) {
    const period = await prisma.evaluationPeriod.findUnique({ where: { id: request.periodId }, select: { isLocked: true } })
    if (period?.isLocked || !(await inReview(request.periodId))) continue
    // Claimed first, so two runs at once remind once; a lead who decided meanwhile is not reminded.
    const claimed = await prisma.peerChangeRequest.updateMany({ where: { id: request.id, remindedAt: null, status: 'PENDING', approverVote: 'PENDING' }, data: { remindedAt: now } })
    if (claimed.count === 0) continue
    const result = await sendFreshLinks(request, { peer: false, lead: true }, send, appUrl, 'reminder', true).catch((error: unknown) => {
      console.error('[weekly] mapping reminder failed', { requestId: request.id, error })
      return { sent: 0, recorded: 0, skipped: 0, failed: 1 }
    })
    // Not delivered: unclaim, so HR is not told the lead was reminded and tomorrow's run tries again with a fresh link.
    if (result.failed > 0) await prisma.peerChangeRequest.updateMany({ where: { id: request.id, remindedAt: now }, data: { remindedAt: null } })
    total = { sent: total.sent + result.sent, recorded: total.recorded + result.recorded, skipped: total.skipped + result.skipped, failed: total.failed + result.failed }
  }
  return total
}

export async function adminPeerRequests(actor: WeeklyActor): Promise<{ period: { id: string; name: string } | null; requests: PeerRequestView[] }> {
  assertHr(actor)
  const period = await mappingPeriod().catch(() => null)
  if (!period) return { period: null, requests: [] }
  const requests = await prisma.peerChangeRequest.findMany({ where: { periodId: period.id }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] })
  const people = await loadPeople(requests.flatMap((r) => [r.requesterId, r.peerId, r.approverId ?? '']))
  return { period: { id: period.id, name: period.name }, requests: requests.map((r) => requestView(r, people)) }
}

/** HR's pre-evaluation step: everyone with a mapping gets their lead, team and peers, and a link to check them. */
export async function sendMappingEmails(actor: WeeklyActor, now: Date, send: WeeklySendMail, appUrl: string, periodId?: string): Promise<WeeklySendResult> {
  assertHr(actor)
  const period = await mappingPeriod(periodId)
  const assignments = await getResolvedEvaluationAssignments(period.id)
  const userIds = [...new Set(assignments.flatMap((a) => [a.evaluatorId, a.evaluateeId]))]
  const people = await loadPeople(userIds)
  const names = (ids: string[]) => ids.map((id) => people.get(id)?.name ?? 'Unknown').sort((a, b) => a.localeCompare(b))
  // The review stage's deadline, when the round has one: "Check your lists by 2 Oct" (UX spec, section 13).
  const reviewDeadline = (await prisma.weeklyCycle.findUnique({ where: { periodId: period.id }, select: { reviewDeadline: true } }))?.reviewDeadline
  const deadline = reviewDeadline ? formatKarachiDate(reviewDeadline.toISOString()) : null
  const messages: WeeklyEmailMessage[] = userIds.flatMap((userId) => {
    const person = people.get(userId)
    if (!person || isOutsideRedesign(person)) return []
    const mapping = mappingOf(userId, assignments)
    if (mapping.leads.length + mapping.reports.length + mapping.peers.length === 0) return []
    return [{
      userId, kind: 'weekly-mapping' as const, dedupeKey: `weekly-mapping:${period.id}:${userId}:${now.toISOString().slice(0, 10)}`,
      render: (name: string) => renderMappingEmail({ name, periodName: period.name, leads: names(mapping.leads), reports: names(mapping.reports), peers: names(mapping.peers), deadline, appUrl }),
    }]
  })
  const result = await deliverOnce(messages, send)
  await recordAudit(prisma, { actorId: actor.id, actorRole: 'HR', action: 'MAPPING_EMAILS', objectType: 'EvaluationPeriod', objectId: period.id, after: result })
  return result
}

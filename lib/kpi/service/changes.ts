import type { KpiChangeRequest } from '@prisma/client'
import { prisma } from '@/lib/db'
import { formatMonthKey } from '../calendar'
import { canDecideChange, canRequestChange, isVerifierEligible, ownerError, type GoalRef, type KpiActor, type KpiRef } from '../permissions'
import { changeProposalSchema, type ChangeRequestInput, type DecideChangeInput } from '../schemas'
import { transition } from '../state-machine'
import type { ChangeProposal, ChangeRequestView } from '../view-types'
import { loadKpiContext, personRef, type KpiContext } from './context'
import { toJson } from './db'
import { KpiError } from './errors'
import { eventRole, recordEvent } from './events'
import { refreshMonthFinalization } from './finalization'
import { assertFresh, kpiRefOf, loadForAction, stateOf, STALE_MESSAGE, type LoadedKpi } from './kpi-load'

const ALREADY_DECIDED = 'This request was already decided'

function goalRefOf(kpi: LoadedKpi): GoalRef {
  return { scope: kpi.goal.scope, setterId: kpi.goal.setterId, departmentKey: kpi.goal.departmentKey }
}

async function addedOwnersError(kpi: LoadedKpi, ownerIds: string[] | undefined): Promise<string | null> {
  if (!ownerIds) return null
  if (new Set(ownerIds).size !== ownerIds.length) return 'Owners must be unique'
  const current = kpi.assignees.map((assignee) => assignee.userId)
  const added = ownerIds.filter((id) => !current.includes(id))
  if (added.length === 0) return null
  const { scope } = await loadKpiContext()
  return ownerError(goalRefOf(kpi), added, scope)
}

export async function requestChange(actor: KpiActor, kpiId: string, input: ChangeRequestInput, now: Date = new Date()): Promise<KpiChangeRequest> {
  const { before, kpi } = await loadForAction(kpiId, (k) => canRequestChange(actor, kpiRefOf(k)), 'You cannot request changes to this KPI', now)
  assertFresh(before, input.version)
  if (kpi.changes.length > 0) throw new KpiError('A change request for this KPI is already waiting for a decision', 409)
  const edit = 'cancel' in input.proposed ? null : input.proposed
  const check = transition(stateOf(kpi), { type: edit ? 'APPROVE_EDIT' : 'APPROVE_CANCEL' }, kpi.goal.kpiMonth, now)
  if (!check.ok) throw new KpiError('Only locked KPIs that are not final yet can be changed by request', 409)
  const problem = await addedOwnersError(kpi, edit?.ownerIds)
  if (problem) throw new KpiError(problem)
  return prisma.$transaction(async (tx) => {
    const request = await tx.kpiChangeRequest.create({
      data: { kpiId: kpi.id, requestedById: actor.id, proposed: toJson(input.proposed), reason: input.reason },
    })
    await recordEvent(tx, {
      kpiId: kpi.id, kpiMonthId: kpi.goal.kpiMonthId, actorId: actor.id, actorRole: eventRole(actor, 'REQUESTER'),
      action: 'CHANGE_REQUESTED', after: input.proposed, reason: input.reason,
    })
    return request
  })
}

export async function decideChange(
  actor: KpiActor,
  requestId: string,
  input: DecideChangeInput,
  now: Date = new Date(),
): Promise<{ status: 'APPROVED' | 'REJECTED' }> {
  const request = await prisma.kpiChangeRequest.findUnique({ where: { id: requestId } })
  if (!request) throw new KpiError('Change request not found', 404)
  if (request.status !== 'PENDING') throw new KpiError(ALREADY_DECIDED, 409)
  const { kpi } = await loadForAction(
    request.kpiId,
    (k) => canDecideChange(actor, kpiRefOf(k), request.requestedById),
    'You cannot decide this request: deciders never decide changes they asked for, own or set',
    now,
  )
  const role = eventRole(actor, 'VERIFIER')
  if (!input.approve) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.kpiChangeRequest.updateMany({
        where: { id: request.id, status: 'PENDING' },
        data: { status: 'REJECTED', decidedById: actor.id, decidedAt: now, decisionNote: input.note },
      })
      if (updated.count === 0) throw new KpiError(ALREADY_DECIDED, 409)
      await recordEvent(tx, { kpiId: kpi.id, kpiMonthId: kpi.goal.kpiMonthId, actorId: actor.id, actorRole: role, action: 'CHANGE_REJECTED', reason: input.note })
    })
    return { status: 'REJECTED' }
  }
  const proposed = changeProposalSchema.parse(request.proposed) as ChangeProposal
  const edit = 'cancel' in proposed ? null : proposed
  const result = transition(stateOf(kpi), { type: edit ? 'APPROVE_EDIT' : 'APPROVE_CANCEL' }, kpi.goal.kpiMonth, now)
  if (!result.ok) throw new KpiError('This KPI can no longer be changed: it already has a final result', 409)
  const problem = await addedOwnersError(kpi, edit?.ownerIds)
  if (problem) throw new KpiError(problem)
  const before = {
    title: kpi.title, target: kpi.target, evidenceType: kpi.evidenceType,
    assigneeIds: kpi.assignees.map((assignee) => assignee.userId).sort(),
  }
  const after = edit
    ? {
        title: edit.title ?? kpi.title,
        target: edit.target ?? kpi.target,
        evidenceType: edit.evidenceType ?? kpi.evidenceType,
        assigneeIds: [...(edit.ownerIds ?? before.assigneeIds)].sort(),
      }
    : before
  await prisma.$transaction(async (tx) => {
    const updated = await tx.kpi.updateMany({
      where: { id: kpi.id, version: kpi.version },
      data: { status: result.to, title: after.title, target: after.target, evidenceType: after.evidenceType, version: { increment: 1 } },
    })
    if (updated.count === 0) throw new KpiError(STALE_MESSAGE, 409)
    if (edit?.ownerIds) {
      await tx.kpiAssignee.deleteMany({ where: { kpiId: kpi.id } })
      await tx.kpiAssignee.createMany({ data: edit.ownerIds.map((userId) => ({ kpiId: kpi.id, userId })) })
    }
    const decided = await tx.kpiChangeRequest.updateMany({
      where: { id: request.id, status: 'PENDING' },
      data: { status: 'APPROVED', decidedById: actor.id, decidedAt: now, decisionNote: input.note },
    })
    if (decided.count === 0) throw new KpiError(ALREADY_DECIDED, 409)
    await recordEvent(tx, {
      kpiId: kpi.id, kpiMonthId: kpi.goal.kpiMonthId, actorId: actor.id, actorRole: role, action: 'CHANGE_APPROVED',
      fromStatus: kpi.status, toStatus: result.to, before, after, reason: request.reason,
    })
  })
  await refreshMonthFinalization(kpi.goal.kpiMonthId, now)
  return { status: 'APPROVED' }
}

interface ChangeKpiLike {
  id: string
  title: string
  claimedById: string | null
  assignees: Array<{ userId: string }>
  goal: { scope: 'TEAM' | 'DEPARTMENT'; setterId: string; departmentKey: string | null; kpiMonth: { year: number; month: number } }
}

export function toChangeRequestView(ctx: KpiContext, actor: KpiActor, request: KpiChangeRequest, kpi: ChangeKpiLike): ChangeRequestView {
  const ref: KpiRef = {
    scope: kpi.goal.scope, setterId: kpi.goal.setterId, departmentKey: kpi.goal.departmentKey,
    assigneeIds: kpi.assignees.map((assignee) => assignee.userId), claimedById: kpi.claimedById,
  }
  return {
    id: request.id,
    kpiId: kpi.id,
    kpiTitle: kpi.title,
    monthKey: formatMonthKey(kpi.goal.kpiMonth),
    requestedBy: personRef(ctx, request.requestedById),
    proposed: changeProposalSchema.parse(request.proposed) as ChangeProposal,
    reason: request.reason,
    createdAt: request.createdAt.toISOString(),
    status: request.status,
    decisionNote: request.decisionNote,
    canDecide: request.status === 'PENDING' && canDecideChange(actor, ref, request.requestedById),
  }
}

export async function changeRequestsFor(actor: KpiActor): Promise<ChangeRequestView[]> {
  if (!isVerifierEligible(actor)) throw new KpiError('Verifier access required', 403)
  const ctx = await loadKpiContext()
  const rows = await prisma.kpiChangeRequest.findMany({
    where: { status: 'PENDING' },
    include: { kpi: { include: { goal: { include: { kpiMonth: true } }, assignees: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map((row) => toChangeRequestView(ctx, actor, row, row.kpi))
}

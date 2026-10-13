// §5 Review: per-subtask verdicts, approve-all, bulk verify (confirmation-only),
// reopen, and prohibited-content deletion. Reviewer ≠ submitter is enforced
// here (last-resort self-review excepted, flagged). Verify is refused on
// non-compliant answers.
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { canManageTasks, canReview, type SecurityActor } from '../access'
import { nonCompliantQuestions } from '../answers'
import { rollUp } from '../rollup'
import type { VerdictInput } from '../schemas'
import { canReopen, canReview as isReviewable, returnOutcome } from '../timeline'
import type { SubtaskStatus, TaskStatus } from '../types'
import { actorEntry, actorRoleLabel, requireCapability } from './actor'
import { appendAudit } from './audit'
import type { BlobStore } from './blob-store'
import { type Db, inTransaction } from './db'
import { conflict, notFound, SecurityChecksError } from './errors'
import { applyDueExpiries } from './expiry'
import { queueNotifications } from './notifications'
import { resolveSelfReview, type SelfReviewOutcome } from './self-review-guard'
import { touchTask, transitionTask } from './task-transition'
import { answersOf, questionDefs, TASK_DETAIL_INCLUDE, timelineOf, type TaskWithDetail } from './task-views'

type Verdict = VerdictInput['action']
type Subtask = TaskWithDetail['subtasks'][number]

const SUBTASK_RESULT: Record<Verdict, SubtaskStatus> = {
  VERIFY: 'VERIFIED',
  REJECT: 'REJECTED',
  REQUEST_INFO: 'REQUIRES_INFO',
  APPROVE_NA: 'NOT_APPLICABLE',
  DENY_NA: 'REJECTED',
}

interface ReviewContext {
  tx: Prisma.TransactionClient
  actor: SecurityActor
  task: TaskWithDetail
  self: SelfReviewOutcome
  now: Date
}

const taskRef = (task: TaskWithDetail) => ({
  id: task.id,
  status: task.status as TaskStatus,
  version: task.version,
  campaignId: task.campaignId,
  cycleId: task.cycleId,
})

async function loadTask(tx: Prisma.TransactionClient, taskId: string): Promise<TaskWithDetail> {
  const task = await tx.securityTask.findUnique({ where: { id: taskId }, include: TASK_DETAIL_INCLUDE })
  if (!task) throw notFound('Task not found')
  return task
}

async function reviewContext(
  tx: Prisma.TransactionClient,
  actor: SecurityActor,
  taskId: string,
  justification: string | undefined,
  now: Date,
): Promise<ReviewContext> {
  const task = await loadTask(tx, taskId)
  if (!isReviewable(timelineOf(task), now)) throw conflict('This task is not awaiting review')
  const self = await resolveSelfReview(tx, actor, task.userId, justification, now)
  return { tx, actor, task, self, now }
}

export function verdictError(subtask: Subtask, action: Verdict, task: TaskWithDetail): string | null {
  if (subtask.status !== 'PENDING_REVIEW') return `“${subtask.name}” is not awaiting review`
  const naAction = action === 'APPROVE_NA' || action === 'DENY_NA'
  if (naAction && !subtask.naRequested) return `No N/A was requested for “${subtask.name}”`
  if (action === 'VERIFY' && subtask.naRequested) return `Approve or deny the N/A request for “${subtask.name}” instead`
  if (action === 'VERIFY' && subtask.source !== 'DECLARATION') {
    if (nonCompliantQuestions(questionDefs(task), answersOf(subtask.answers)).length > 0) {
      return `“${subtask.name}” has a non-compliant answer and can never be verified — reject it so the employee can fix the issue`
    }
  }
  return null
}

function notifyOwner(ctx: ReviewContext, kind: string, title: string, body: string) {
  return queueNotifications(ctx.tx, [
    { userId: ctx.task.userId, kind, title, body, taskId: ctx.task.id, dedupeKey: `${kind.toLowerCase()}:${ctx.task.id}:${ctx.now.toISOString()}` },
  ])
}

async function settleTask(ctx: ReviewContext, statuses: SubtaskStatus[]): Promise<void> {
  const { tx, task, actor, now } = ctx
  const audit = { actorId: actor.id, actorRole: actorRoleLabel(actor), selfReview: ctx.self.selfReview }
  const campaignName = task.cycle.campaign.name
  const rolled = rollUp(statuses)
  if (rolled === null || rolled === 'PENDING_REVIEW') {
    await touchTask(tx, task, {})
    return
  }
  if (rolled === 'VERIFIED') {
    await transitionTask(tx, taskRef(task), 'VERIFIED', 'VERIFY', audit, { lastVerdictAt: now })
    await notifyOwner(ctx, 'VERIFIED', 'Security check verified', `“${campaignName}” was verified. Nothing more to do this cycle.`)
    return
  }
  if (rolled === 'NOT_APPLICABLE') {
    await transitionTask(tx, taskRef(task), 'NOT_APPLICABLE', 'NOT_APPLICABLE', audit, {
      lastVerdictAt: now,
      naGrantedById: actor.id,
      naReason: 'Every subtask was approved as not applicable',
    })
    await notifyOwner(ctx, 'NOT_APPLICABLE', 'Security check marked not applicable', `“${campaignName}” does not apply to you this cycle.`)
    return
  }
  const outcome = returnOutcome(task, rolled, now)
  if (outcome.status === 'EXPIRED') {
    await transitionTask(tx, taskRef(task), 'EXPIRED', 'EXPIRE_REVIEW', { ...audit, details: { expiryReason: outcome.expiryReason } }, {
      expiryReason: outcome.expiryReason,
      expiredAt: now,
      lastVerdictAt: now,
      resubmitDueAt: null,
    })
    await notifyOwner(ctx, 'EXPIRED', 'Security check closed', `Your final resubmission for “${campaignName}” was not accepted. It will be checked again next cycle.`)
    return
  }
  await transitionTask(tx, taskRef(task), outcome.status, 'RETURN', audit, { resubmitDueAt: outcome.resubmitDueAt, lastVerdictAt: now })
  await notifyOwner(
    ctx,
    'RETURNED',
    outcome.status === 'REJECTED' ? 'Security check needs changes' : 'More information needed',
    `“${campaignName}” was returned. Fix the flagged items and resubmit before the window closes.`,
  )
}

async function applyVerdicts(ctx: ReviewContext, verdicts: ReadonlyArray<{ subtask: Subtask; action: Verdict; reason: string | null }>): Promise<void> {
  const { tx, task, actor } = ctx
  const submissionId = task.submissions.at(-1)?.id ?? null
  const results = new Map<string, SubtaskStatus>()
  for (const { subtask, action, reason } of verdicts) {
    results.set(subtask.id, SUBTASK_RESULT[action])
    await tx.securitySubtask.update({
      where: { id: subtask.id },
      data: {
        status: SUBTASK_RESULT[action],
        lastVerdict: action,
        lastVerdictReason: reason,
        ...(action === 'APPROVE_NA' ? { naApprovedById: actor.id } : {}),
        ...(action === 'DENY_NA' ? { naRequested: false } : {}),
      },
    })
    await tx.securityReviewAction.create({
      data: {
        taskId: task.id,
        subtaskId: subtask.id,
        submissionId,
        action,
        reviewerId: actor.id,
        reason,
        selfReview: ctx.self.selfReview,
        selfReviewJustification: ctx.self.justification,
      },
    })
    await appendAudit(tx, actorEntry(actor, 'REVIEW_VERDICT', 'SUBTASK', {
      targetId: subtask.id,
      taskId: task.id,
      campaignId: task.campaignId,
      cycleId: task.cycleId,
      selfReview: ctx.self.selfReview,
      details: { action, reason, selfReviewJustification: ctx.self.justification },
    }))
  }
  await settleTask(ctx, task.subtasks.map((subtask) => results.get(subtask.id) ?? (subtask.status as SubtaskStatus)))
}

export async function reviewSubtask(actor: SecurityActor, taskId: string, input: VerdictInput, now: Date, db: Db = prisma): Promise<void> {
  requireCapability(canReview(actor), 'Only Security Admins review submissions')
  await applyDueExpiries({ id: taskId }, now, db)
  await inTransaction(db, async (tx) => {
    const ctx = await reviewContext(tx, actor, taskId, input.selfReviewJustification, now)
    const subtasks = ctx.task.subtasks
    const subtask = input.subtaskId ? subtasks.find((entry) => entry.id === input.subtaskId) : subtasks.length === 1 ? subtasks[0] : undefined
    if (!subtask) throw new SecurityChecksError('Choose which subtask this verdict is for', 400)
    const error = verdictError(subtask, input.action, ctx.task)
    if (error) throw conflict(error)
    await applyVerdicts(ctx, [{ subtask, action: input.action, reason: input.reason?.trim() || null }])
  })
}

/** Approve-all for one task: verifies evidence-bearing subtasks and approves N/A requests. */
export async function approveAll(actor: SecurityActor, taskId: string, justification: string | undefined, now: Date, db: Db = prisma): Promise<void> {
  requireCapability(canReview(actor), 'Only Security Admins review submissions')
  await applyDueExpiries({ id: taskId }, now, db)
  await inTransaction(db, async (tx) => {
    const ctx = await reviewContext(tx, actor, taskId, justification, now)
    const verdicts = ctx.task.subtasks
      .filter((subtask) => subtask.status === 'PENDING_REVIEW')
      .map((subtask) => ({ subtask, action: (subtask.naRequested ? 'APPROVE_NA' : 'VERIFY') as Verdict, reason: null }))
    const errors = verdicts.map(({ subtask, action }) => verdictError(subtask, action, ctx.task)).filter((error): error is string => error !== null)
    if (errors.length > 0) throw conflict(errors.join('; '))
    if (verdicts.length === 0) throw conflict('Nothing in this task is awaiting review')
    await applyVerdicts(ctx, verdicts)
  })
}

export interface BulkVerifyResult {
  verified: string[]
  skipped: Array<{ taskId: string; reason: string }>
}

/** Bulk verify for confirmation-only campaigns; non-compliant and own tasks are skipped and reported. */
export async function bulkVerify(actor: SecurityActor, taskIds: readonly string[], now: Date, db: Db = prisma): Promise<BulkVerifyResult> {
  requireCapability(canReview(actor), 'Only Security Admins review submissions')
  await applyDueExpiries({ id: { in: [...taskIds] } }, now, db)
  const result: BulkVerifyResult = { verified: [], skipped: [] }
  for (const taskId of new Set(taskIds)) {
    try {
      await inTransaction(db, async (tx) => {
        const task = await loadTask(tx, taskId)
        const campaign = task.cycle.campaign
        if (campaign.evidenceRequired || campaign.subtaskMode !== 'NONE') throw conflict('Not a confirmation-only campaign')
        if (task.userId === actor.id) throw conflict('Your own task needs the other Security Admin')
        if (!isReviewable(timelineOf(task), now)) throw conflict('Not awaiting review')
        const pending = task.subtasks.filter((subtask) => subtask.status === 'PENDING_REVIEW')
        const errors = pending.map((subtask) => verdictError(subtask, 'VERIFY', task)).filter(Boolean)
        if (errors.length > 0) throw conflict('Non-compliant answer — review it individually')
        const ctx: ReviewContext = { tx, actor, task, self: { selfReview: false, justification: null }, now }
        await applyVerdicts(ctx, pending.map((subtask) => ({ subtask, action: 'VERIFY' as Verdict, reason: null })))
      })
      result.verified.push(taskId)
    } catch (error) {
      if (!(error instanceof SecurityChecksError)) throw error
      result.skipped.push({ taskId, reason: error.message })
    }
  }
  return result
}

/** §5 Correcting a verdict: reopen a Verified task to Pending Review until wrap-up end. */
export async function reopenTask(
  actor: SecurityActor,
  taskId: string,
  input: { reason: string; selfReviewJustification?: string },
  now: Date,
  db: Db = prisma,
): Promise<void> {
  requireCapability(canManageTasks(actor), 'Only Security Admins can reopen tasks')
  await inTransaction(db, async (tx) => {
    const task = await loadTask(tx, taskId)
    if (!canReopen(timelineOf(task), now)) throw conflict('Only Verified tasks can be reopened, and only until the review wrap-up ends')
    const self = await resolveSelfReview(tx, actor, task.userId, input.selfReviewJustification, now)
    await tx.securitySubtask.updateMany({ where: { taskId, status: 'VERIFIED' }, data: { status: 'PENDING_REVIEW' } })
    await tx.securityReviewAction.create({
      data: {
        taskId,
        submissionId: task.submissions.at(-1)?.id ?? null,
        action: 'REOPEN',
        reviewerId: actor.id,
        reason: input.reason,
        selfReview: self.selfReview,
        selfReviewJustification: self.justification,
      },
    })
    await transitionTask(tx, taskRef(task), 'PENDING_REVIEW', 'REOPEN', {
      actorId: actor.id,
      actorRole: actorRoleLabel(actor),
      selfReview: self.selfReview,
      reason: input.reason,
    })
  })
}

/**
 * §8 Prohibited content (codes, QR codes, secrets, passwords): the file is
 * deleted immediately (logged with reason), a pending subtask is rejected,
 * and the employee is told to rotate the exposed secret.
 */
export async function deleteProhibitedEvidence(
  actor: SecurityActor,
  taskId: string,
  fileId: string,
  reason: string,
  now: Date,
  store: BlobStore,
  db: Db = prisma,
): Promise<void> {
  requireCapability(canReview(actor), 'Only Security Admins can delete evidence')
  await applyDueExpiries({ id: taskId }, now, db)
  await inTransaction(db, async (tx) => {
    const task = await loadTask(tx, taskId)
    const subtask = task.subtasks.find((entry) => entry.files.some((file) => file.id === fileId))
    const file = subtask?.files.find((entry) => entry.id === fileId)
    if (!subtask || !file) throw notFound('File not found')
    if (file.deletedAt) throw conflict('This file was already deleted')
    const self = await resolveSelfReview(tx, actor, task.userId, undefined, now).catch((error: unknown) => {
      throw error instanceof SecurityChecksError && error.status === 400
        ? new SecurityChecksError('Ask the other Security Admin to remove prohibited content from your own task', 403)
        : error
    })
    await store.remove(file.storagePath)
    await tx.securityEvidenceFile.update({
      where: { id: fileId },
      data: { deletedAt: now, deletedById: actor.id, deletedReason: `Prohibited content: ${reason}` },
    })
    await appendAudit(tx, actorEntry(actor, 'EVIDENCE_DELETED_PROHIBITED', 'EVIDENCE', {
      targetId: fileId,
      taskId,
      campaignId: task.campaignId,
      cycleId: task.cycleId,
      details: { fileName: file.fileName, reason },
    }))
    const ctx: ReviewContext = { tx, actor, task, self, now }
    await notifyOwner(
      ctx,
      'ROTATE_SECRET',
      'Rotate the exposed secret',
      `A file you uploaded for “${task.cycle.campaign.name}” contained something that must never be shared (codes, QR codes, secrets or passwords) and was deleted. Rotate or reset it now, then upload safe evidence.`,
    )
    if (subtask.status === 'PENDING_REVIEW' && isReviewable(timelineOf(task), now)) {
      await applyVerdicts(ctx, [
        { subtask, action: 'REJECT', reason: `Prohibited content was uploaded and deleted (${reason}). Rotate the exposed secret before resubmitting safe evidence.` },
      ])
    }
  })
}

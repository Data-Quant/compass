// §10 Extensions, exemptions and task-level N/A (Security Admins only; own
// task only via the last-resort self-review rule, flagged).
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { canManageTasks, type SecurityActor } from '../access'
import { addDays, endOfKarachiDateKey, laterOf } from '../dates'
import { canExemptExpired, isReturned, RESUBMIT_WINDOW_DAYS } from '../timeline'
import { isFinalTaskStatus, LIMITS, type TaskStatus } from '../types'
import { actorEntry, actorRoleLabel, requireCapability } from './actor'
import { appendAudit } from './audit'
import { type Db, inTransaction } from './db'
import { conflict, notFound, SecurityChecksError } from './errors'
import { applyDueExpiries } from './expiry'
import { queueNotifications } from './notifications'
import { resolveSelfReview } from './self-review-guard'
import { touchTask, transitionTask } from './task-transition'

interface AdminInput {
  reason: string
  selfReviewJustification?: string
}

async function loadTask(tx: Prisma.TransactionClient, taskId: string) {
  const task = await tx.securityTask.findUnique({ where: { id: taskId }, include: { cycle: { include: { campaign: { select: { name: true } } } } } })
  if (!task) throw notFound('Task not found')
  return task
}

const ref = (task: { id: string; status: string; version: number; campaignId: string; cycleId: string }) => ({
  id: task.id,
  status: task.status as TaskStatus,
  version: task.version,
  campaignId: task.campaignId,
  cycleId: task.cycleId,
})

/** Max 30 days past the original deadline; grace, close and wrap-up follow the new deadline. */
export async function grantExtension(
  actor: SecurityActor,
  taskId: string,
  input: AdminInput & { newDeadline: string },
  now: Date,
  db: Db = prisma,
): Promise<void> {
  requireCapability(canManageTasks(actor), 'Only Security Admins can grant extensions')
  await applyDueExpiries({ id: taskId }, now, db)
  await inTransaction(db, async (tx) => {
    const task = await loadTask(tx, taskId)
    if (isFinalTaskStatus(task.status as TaskStatus)) throw conflict('Final tasks cannot be extended')
    const deadline = endOfKarachiDateKey(input.newDeadline)
    if (!deadline) throw new SecurityChecksError('Choose a valid date', 400)
    if (deadline.getTime() <= task.deadline.getTime()) throw new SecurityChecksError('The new deadline must be later than the current one', 400)
    if (deadline.getTime() > addDays(task.originalDeadline, LIMITS.maxExtensionDays).getTime()) {
      throw new SecurityChecksError(`Extensions are limited to ${LIMITS.maxExtensionDays} days past the original deadline`, 400)
    }
    const self = await resolveSelfReview(tx, actor, task.userId, input.selfReviewJustification, now)
    const resubmitDueAt =
      isReturned(task.status as TaskStatus) && task.lastVerdictAt
        ? laterOf(deadline, addDays(task.lastVerdictAt, RESUBMIT_WINDOW_DAYS))
        : task.resubmitDueAt
    await touchTask(tx, task, { deadline, resubmitDueAt, extendedAt: now, extendedById: actor.id, extensionReason: input.reason })
    await appendAudit(tx, actorEntry(actor, 'TASK_EXTENDED', 'TASK', {
      targetId: taskId,
      taskId,
      campaignId: task.campaignId,
      cycleId: task.cycleId,
      selfReview: self.selfReview,
      details: { from: task.deadline, to: deadline, reason: input.reason, selfReviewJustification: self.justification },
    }))
    await queueNotifications(tx, [{
      userId: task.userId,
      kind: 'EXTENDED',
      title: 'Deadline extended',
      body: `The deadline for “${task.cycle.campaign.name}” was extended.`,
      taskId,
      dedupeKey: `extended:${taskId}:${now.toISOString()}`,
    }])
  })
}

/** One cycle only. Also allowed on a no-submission Expired task until its own task close (D+7). */
export async function exemptTask(actor: SecurityActor, taskId: string, input: AdminInput, now: Date, db: Db = prisma): Promise<void> {
  requireCapability(canManageTasks(actor), 'Only Security Admins can grant exemptions')
  await applyDueExpiries({ id: taskId }, now, db)
  await inTransaction(db, async (tx) => {
    const task = await loadTask(tx, taskId)
    const status = task.status as TaskStatus
    const expiredExemptable = canExemptExpired({ status, deadline: task.deadline, resubmitDueAt: task.resubmitDueAt, finalRoundAt: task.finalRoundAt, expiryReason: task.expiryReason }, now)
    if (isFinalTaskStatus(status) && !expiredExemptable) {
      throw conflict('Only open tasks, or tasks expired for no submission (until 7 days after their deadline), can be exempted')
    }
    const self = await resolveSelfReview(tx, actor, task.userId, input.selfReviewJustification, now)
    await transitionTask(
      tx,
      ref(task),
      'EXEMPT',
      expiredExemptable ? 'EXEMPT_EXPIRED' : 'EXEMPT',
      { actorId: actor.id, actorRole: actorRoleLabel(actor), selfReview: self.selfReview, reason: input.reason, details: { selfReviewJustification: self.justification } },
      { exemptedAt: now, exemptedById: actor.id, exemptionReason: input.reason, resubmitDueAt: null },
    )
    await queueNotifications(tx, [{
      userId: task.userId,
      kind: 'EXEMPTED',
      title: 'Exempted this cycle',
      body: `You are exempt from “${task.cycle.campaign.name}” this cycle.`,
      taskId,
      dedupeKey: `exempted:${taskId}`,
    }])
  })
}

/** Task-level N/A stays reviewer-granted. */
export async function markTaskNotApplicable(actor: SecurityActor, taskId: string, input: AdminInput, now: Date, db: Db = prisma): Promise<void> {
  requireCapability(canManageTasks(actor), 'Only Security Admins can mark tasks not applicable')
  await applyDueExpiries({ id: taskId }, now, db)
  await inTransaction(db, async (tx) => {
    const task = await loadTask(tx, taskId)
    if (isFinalTaskStatus(task.status as TaskStatus)) throw conflict('Final tasks cannot be changed')
    const self = await resolveSelfReview(tx, actor, task.userId, input.selfReviewJustification, now)
    await tx.securityReviewAction.create({
      data: { taskId, action: 'TASK_NA', reviewerId: actor.id, reason: input.reason, selfReview: self.selfReview, selfReviewJustification: self.justification },
    })
    await transitionTask(
      tx,
      ref(task),
      'NOT_APPLICABLE',
      'NOT_APPLICABLE',
      { actorId: actor.id, actorRole: actorRoleLabel(actor), selfReview: self.selfReview, reason: input.reason },
      { naGrantedById: actor.id, naReason: input.reason, resubmitDueAt: null },
    )
  })
}

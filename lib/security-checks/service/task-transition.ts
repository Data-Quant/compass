// Every task status change goes through here: checked against the §6 table,
// guarded by optimistic versioning, and audit-logged.
import type { Prisma } from '@prisma/client'
import { transitionError, type TransitionTrigger } from '../transitions'
import type { TaskStatus } from '../types'
import { appendAudit } from './audit'
import { conflict, SecurityChecksError } from './errors'

export interface TaskRef {
  id: string
  status: TaskStatus
  version: number
  campaignId: string
  cycleId: string
}

export interface TransitionAudit {
  actorId: string | null
  actorRole: string
  selfReview?: boolean
  reason?: string | null
  details?: Record<string, unknown>
}

export async function transitionTask(
  tx: Prisma.TransactionClient,
  task: TaskRef,
  to: TaskStatus,
  trigger: TransitionTrigger,
  audit: TransitionAudit,
  data: Prisma.SecurityTaskUpdateManyMutationInput = {},
): Promise<void> {
  const error = transitionError(task.status, to, trigger)
  if (error) throw new SecurityChecksError(error, 409)
  const result = await tx.securityTask.updateMany({
    where: { id: task.id, version: task.version },
    data: { ...data, status: to, version: { increment: 1 } },
  })
  if (result.count === 0) throw conflict()
  await appendAudit(tx, {
    actorId: audit.actorId,
    actorRole: audit.actorRole,
    action: 'TASK_STATUS_CHANGED',
    targetType: 'TASK',
    targetId: task.id,
    taskId: task.id,
    campaignId: task.campaignId,
    cycleId: task.cycleId,
    selfReview: audit.selfReview ?? false,
    details: { from: task.status, to, trigger, reason: audit.reason ?? null, ...audit.details },
  })
}

/** Field update without a status change, still version-guarded. Returns the new version. */
export async function touchTask(
  tx: Prisma.TransactionClient,
  task: Pick<TaskRef, 'id' | 'version'>,
  data: Prisma.SecurityTaskUpdateManyMutationInput,
): Promise<number> {
  const result = await tx.securityTask.updateMany({ where: { id: task.id, version: task.version }, data: { ...data, version: { increment: 1 } } })
  if (result.count === 0) throw conflict()
  return task.version + 1
}

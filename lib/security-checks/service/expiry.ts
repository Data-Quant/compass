// §4/§14 Per-task expiry. Called by the scheduler and lazily before reads and
// writes, so a task is never acted on in a state it has already timed out of.
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { pendingExpiry, reviewDeadlineOf } from '../timeline'
import type { ExpiryReason, TaskStatus } from '../types'
import type { TransitionTrigger } from '../transitions'
import { SYSTEM_ACTOR_ROLE } from './audit'
import { type Db, inTransaction } from './db'
import { SecurityChecksError } from './errors'
import { queueNotifications, securityAdminIds } from './notifications'
import { transitionTask } from './task-transition'

const EXPIRABLE: TaskStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'REJECTED', 'REQUIRES_INFO', 'PENDING_REVIEW']

const TRIGGER: Record<ExpiryReason, TransitionTrigger> = {
  NO_SUBMISSION: 'EXPIRE_NO_SUBMISSION',
  WINDOW_LAPSED: 'EXPIRE_WINDOW_LAPSED',
  UNREVIEWED: 'EXPIRE_REVIEW',
  REJECTED_POST_CLOSE: 'EXPIRE_REVIEW',
}

/** The instant the task actually timed out (for reporting), not when the job noticed. */
function expiredAtFor(reason: ExpiryReason, task: { deadline: Date; resubmitDueAt: Date | null; finalRoundAt: Date | null; reopenedAt: Date | null }): Date {
  if (reason === 'NO_SUBMISSION') return task.deadline
  if (reason === 'WINDOW_LAPSED' && task.resubmitDueAt) return task.resubmitDueAt
  return reviewDeadlineOf(task)
}

export async function applyDueExpiries(where: Prisma.SecurityTaskWhereInput, now: Date, db: Db = prisma): Promise<number> {
  const tasks = await db.securityTask.findMany({
    where: { AND: [where, { status: { in: EXPIRABLE } }] },
    select: {
      id: true,
      status: true,
      version: true,
      campaignId: true,
      cycleId: true,
      userId: true,
      deadline: true,
      resubmitDueAt: true,
      finalRoundAt: true,
      reopenedAt: true,
    },
  })
  const due = tasks.flatMap((task) => {
    const expiry = pendingExpiry({ ...task, status: task.status as TaskStatus }, now)
    return expiry ? [{ task, expiry }] : []
  })
  if (due.length === 0) return 0

  const adminIds = due.some(({ expiry }) => expiry.flagUnreviewed) ? await securityAdminIds(db) : []
  let changed = 0
  for (const { task, expiry } of due) {
    const applied = await inTransaction(db, async (tx) => {
      try {
        await transitionTask(
          tx,
          { ...task, status: task.status as TaskStatus },
          'EXPIRED',
          TRIGGER[expiry.reason],
          { actorId: null, actorRole: SYSTEM_ACTOR_ROLE, details: { expiryReason: expiry.reason } },
          {
            expiryReason: expiry.reason,
            expiredAt: expiredAtFor(expiry.reason, task),
            unreviewedFlag: expiry.flagUnreviewed,
            resubmitDueAt: null,
          },
        )
      } catch (error) {
        // Changed concurrently (version or status moved on): the next run re-evaluates it.
        if (error instanceof SecurityChecksError && error.status === 409) return false
        throw error
      }
      if (expiry.flagUnreviewed) {
        await queueNotifications(
          tx,
          adminIds.map((userId) => ({
            userId,
            kind: 'UNREVIEWED_EXPIRED',
            title: 'A submission expired unreviewed',
            body: 'A Security Checks submission passed its review deadline without a verdict. See the dashboard.',
            taskId: task.id,
            dedupeKey: `unreviewed:${task.id}:${userId}`,
          })),
        )
      }
      return true
    })
    if (applied) changed += 1
  }
  return changed
}

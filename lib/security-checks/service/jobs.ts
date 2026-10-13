// §14 Background jobs. Each run and each side effect is audit-logged.
import { prisma } from '@/lib/db'
import { parseAudience, resolveAudience } from '../audience'
import { planNewJoiner } from '../enrollment'
import { FINAL_TASK_STATUSES, TASK_STATUSES, type TaskStatus } from '../types'
import { appendAudit, appendAuditMany, SYSTEM_ACTOR_ROLE, systemEntry } from './audit'
import type { BlobStore } from './blob-store'
import { createTasks, newTaskNotification, openNextCycleIfDue, settleCycle, type TaskSeed } from './cycles'
import { type Db, inTransaction } from './db'
import { loadDirectory } from './directory'
import { SecurityChecksError } from './errors'
import { applyDueExpiries } from './expiry'
import { deliverPendingEmails, queueNotifications } from './notifications'
import { runReminders } from './reminder-job'
import { runRetention } from './retention'
import { transitionTask } from './task-transition'

const NON_FINAL: TaskStatus[] = TASK_STATUSES.filter((status) => !FINAL_TASK_STATUSES.includes(status))

async function logRun(db: Db, job: string, details: Record<string, unknown>): Promise<void> {
  await appendAudit(db, systemEntry('JOB_RUN', 'JOB', { targetId: job, details }))
}

export async function runCycleCreator(now: Date, db: Db = prisma): Promise<{ opened: number; tasks: number; failures: number }> {
  const campaigns = await db.securityCampaign.findMany({ where: { status: 'ACTIVE' }, select: { id: true } })
  let opened = 0
  let tasks = 0
  let failures = 0
  for (const campaign of campaigns) {
    try {
      const cycle = await openNextCycleIfDue(campaign.id, now, db)
      if (cycle) {
        opened += 1
        tasks += cycle.taskCount
      }
    } catch (error) {
      failures += 1
      console.error('[security-checks] cycle creator failed for campaign', { campaignId: campaign.id, error })
    }
  }
  await logRun(db, 'cycle-creator', { opened, tasks, failures })
  return { opened, tasks, failures }
}

/** §10 Leavers' open tasks are cancelled (history kept); new joiners are enrolled per the cut-off rules. */
export async function runEnrollmentSync(now: Date, db: Db = prisma): Promise<{ enrolled: number; deferred: number; cancelled: number }> {
  const directory = await loadDirectory(db, now)
  const inactive = directory.filter((person) => !person.active).map((person) => person.id)

  let cancelled = 0
  const leaverTasks = await db.securityTask.findMany({
    where: { userId: { in: inactive }, status: { in: NON_FINAL } },
    select: { id: true, status: true, version: true, campaignId: true, cycleId: true },
  })
  for (const task of leaverTasks) {
    try {
      await inTransaction(db, (tx) =>
        transitionTask(tx, { ...task, status: task.status as TaskStatus }, 'CANCELLED', 'CANCEL', { actorId: null, actorRole: SYSTEM_ACTOR_ROLE, reason: 'Employee left' }, { cancelReason: 'Employee left', resubmitDueAt: null }),
      )
      cancelled += 1
    } catch (error) {
      if (!(error instanceof SecurityChecksError && error.status === 409)) throw error
    }
  }

  let enrolled = 0
  let deferred = 0
  const cycles = await db.securityCycle.findMany({
    where: { actualCloseAt: null, scheduledCloseAt: { gt: now }, campaign: { status: 'ACTIVE' } },
    include: { campaign: { include: { subtaskTemplates: true } }, tasks: { select: { userId: true } } },
  })
  for (const cycle of cycles) {
    const existing = new Set(cycle.tasks.map((task) => task.userId))
    const missing = resolveAudience(parseAudience(cycle.campaign.audience), directory).filter((id) => !existing.has(id))
    const seeds: TaskSeed[] = []
    for (const userId of missing) {
      const plan = planNewJoiner(cycle, cycle.campaign.frequency, cycle.campaign.deadlineDays, now)
      if (plan.action === 'NEXT_CYCLE') deferred += 1
      else seeds.push({ userId, deadline: plan.deadline, lateEnrollment: plan.lateEnrollment })
    }
    if (seeds.length === 0) continue
    await inTransaction(db, async (tx) => {
      const created = await createTasks(tx, cycle.campaign, cycle.id, seeds)
      await queueNotifications(tx, created.map((task) => newTaskNotification(cycle.campaign.name, task.taskId, task.userId)))
      await appendAuditMany(
        tx,
        created.map((task) =>
          systemEntry('TASK_ENROLLED', 'TASK', {
            targetId: task.taskId,
            taskId: task.taskId,
            campaignId: cycle.campaignId,
            cycleId: cycle.id,
            details: { userId: task.userId, lateEnrollment: true, deadline: seeds.find((seed) => seed.userId === task.userId)?.deadline },
          }),
        ),
      )
    })
    enrolled += seeds.length
  }
  await logRun(db, 'enrollment-sync', { enrolled, deferred, cancelled })
  return { enrolled, deferred, cancelled }
}

/** Per-task §4 enforcement plus cycle actual close at scheduled close. */
export async function runExpiryAndClose(now: Date, db: Db = prisma): Promise<{ expired: number; cyclesSettled: number }> {
  const expired = await applyDueExpiries({}, now, db)
  const cycles = await db.securityCycle.findMany({ where: { status: { in: ['OPEN', 'CLOSING'] } }, select: { id: true } })
  for (const cycle of cycles) await settleCycle(cycle.id, now, db)
  await logRun(db, 'expiry-and-close', { expired, cyclesChecked: cycles.length })
  return { expired, cyclesSettled: cycles.length }
}

export interface DailyRunResult {
  results: Record<string, unknown>
  errors: Record<string, string>
}

/** Runs the daily jobs in order; one failing job does not stop the others. */
export async function runDailyJobs(now: Date, store: BlobStore, db: Db = prisma): Promise<DailyRunResult> {
  const steps: Array<[string, () => Promise<unknown>]> = [
    ['cycleCreator', () => runCycleCreator(now, db)],
    ['enrollmentSync', () => runEnrollmentSync(now, db)],
    ['expiryAndClose', () => runExpiryAndClose(now, db)],
    ['reminders', () => runReminders(now, db)],
    ['retention', () => runRetention(now, store, db)],
    ['emails', () => deliverPendingEmails(db)],
  ]
  const outcome: DailyRunResult = { results: {}, errors: {} }
  for (const [name, step] of steps) {
    try {
      outcome.results[name] = await step()
    } catch (error) {
      console.error(`[security-checks] daily job ${name} failed`, error)
      outcome.errors[name] = error instanceof Error ? error.message : 'Unknown error'
    }
  }
  return outcome
}

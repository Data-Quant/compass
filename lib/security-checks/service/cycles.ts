// §3/§14 Cycle opening (task creation from the directory) and early close.
import { randomUUID } from 'node:crypto'
import type { Prisma, SecurityCampaign, SecurityCampaignSubtask } from '@prisma/client'
import { prisma } from '@/lib/db'
import { canManageCampaigns, type SecurityActor } from '../access'
import { parseAudience, resolveAudience } from '../audience'
import { cycleDatesFor, openAtForCycle } from '../recurrence'
import { DECLARATION_SUBTASK_NAME, isFinalTaskStatus, type SubtaskSource, type TaskStatus } from '../types'
import { actorEntry, actorRoleLabel, requireCapability } from './actor'
import { DAY_MS } from '../dates'
import { appendAudit, appendAuditMany, SYSTEM_ACTOR_ROLE, systemEntry, type AuditEntry } from './audit'
import { type Db, inTransaction } from './db'
import { loadDirectory } from './directory'
import { conflict, notFound, SecurityChecksError } from './errors'
import { transitionTask } from './task-transition'
import { queueNotifications } from './notifications'

export type CampaignWithTemplates = SecurityCampaign & { subtaskTemplates: SecurityCampaignSubtask[] }

interface SubtaskSeed {
  name: string
  source: SubtaskSource
  templateId: string | null
}

/** Initial subtasks per mode. Campaigns without subtasks get one hidden TASK subtask. */
export function subtaskSeeds(campaign: Pick<CampaignWithTemplates, 'name' | 'subtaskMode' | 'subtaskTemplates'>): SubtaskSeed[] {
  const templates = [...campaign.subtaskTemplates]
    .sort((a, b) => a.position - b.position)
    .map((template) => ({ name: template.name, source: 'ADMIN' as const, templateId: template.id }))
  switch (campaign.subtaskMode) {
    case 'NONE':
      return [{ name: campaign.name, source: 'TASK', templateId: null }]
    case 'ADMIN_DEFINED':
    case 'ADMIN_WITH_EMPLOYEE_ADDITIONS':
      return templates
    case 'EMPLOYEE_DEFINED':
      return [{ name: DECLARATION_SUBTASK_NAME, source: 'DECLARATION', templateId: null }]
  }
}

export interface TaskSeed {
  userId: string
  deadline: Date
  lateEnrollment: boolean
}

/** Creates tasks (and their subtasks) in bulk. Returns the created task ids. */
export async function createTasks(
  tx: Prisma.TransactionClient | typeof prisma,
  campaign: CampaignWithTemplates,
  cycleId: string,
  seeds: readonly TaskSeed[],
): Promise<Array<{ taskId: string; userId: string }>> {
  if (seeds.length === 0) return []
  const subtasks = subtaskSeeds(campaign)
  const tasks = seeds.map((seed) => ({ ...seed, id: randomUUID() }))
  await tx.securityTask.createMany({
    data: tasks.map((task) => ({
      id: task.id,
      cycleId,
      campaignId: campaign.id,
      userId: task.userId,
      deadline: task.deadline,
      originalDeadline: task.deadline,
      lateEnrollment: task.lateEnrollment,
    })),
  })
  await tx.securitySubtask.createMany({
    data: tasks.flatMap((task) =>
      subtasks.map((subtask, position) => ({ taskId: task.id, position, name: subtask.name, source: subtask.source, templateId: subtask.templateId })),
    ),
  })
  return tasks.map((task) => ({ taskId: task.id, userId: task.userId }))
}

export function newTaskNotification(campaignName: string, taskId: string, userId: string) {
  return {
    userId,
    kind: 'NEW_TASK',
    title: 'New security check',
    body: `“${campaignName}” is waiting for you in Security Checks.`,
    taskId,
    dedupeKey: `new-task:${taskId}`,
  }
}

/**
 * Opens the campaign's next cycle when it is due. Returns the new cycle, or
 * null when nothing is due (retired, one-time already run, not yet time, or
 * the previous cycle has not reached its scheduled close).
 */
export async function openNextCycleIfDue(
  campaignId: string,
  now: Date,
  db: Db = prisma,
  actorAudit: Pick<AuditEntry, 'actorId' | 'actorRole'> | null = null,
): Promise<{ cycleId: string; number: number; taskCount: number } | null> {
  return inTransaction(db, async (tx) => {
    const campaign = await tx.securityCampaign.findUnique({ where: { id: campaignId }, include: { subtaskTemplates: true } })
    if (!campaign || campaign.status !== 'ACTIVE' || !campaign.firstOpenAt) return null
    const previous = await tx.securityCycle.findFirst({ where: { campaignId }, orderBy: { number: 'desc' } })
    if (previous && previous.scheduledCloseAt.getTime() > now.getTime() && !previous.actualCloseAt) return null
    const number = (previous?.number ?? 0) + 1
    const openAt = openAtForCycle({
      frequency: campaign.frequency,
      anchor: campaign.recurrenceAnchor,
      firstOpenAt: campaign.firstOpenAt,
      cycleNumber: number,
      previousScheduledCloseAt: previous?.scheduledCloseAt ?? null,
    })
    if (!openAt || openAt.getTime() > now.getTime()) return null

    // Anchor to the scheduled open date; after a scheduler outage of more than
    // a day, count from now so the cycle never opens with a past deadline.
    const lagged = now.getTime() - openAt.getTime() > DAY_MS
    const dates = cycleDatesFor(lagged ? now : openAt, campaign.deadlineDays)
    const cycle = await tx.securityCycle.create({
      data: { campaignId, number, openAt: dates.openAt, deadline: dates.deadline, scheduledCloseAt: dates.scheduledCloseAt },
    })
    const directory = await loadDirectory(tx, now)
    const userIds = resolveAudience(parseAudience(campaign.audience), directory)
    const created = await createTasks(
      tx,
      campaign,
      cycle.id,
      userIds.map((userId) => ({ userId, deadline: dates.deadline, lateEnrollment: false })),
    )
    await queueNotifications(tx, created.map((task) => newTaskNotification(campaign.name, task.taskId, task.userId)))
    const actor = actorAudit ?? { actorId: null, actorRole: SYSTEM_ACTOR_ROLE }
    await appendAudit(tx, {
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      action: 'CYCLE_OPENED',
      targetType: 'CYCLE',
      targetId: cycle.id,
      campaignId,
      cycleId: cycle.id,
      details: { number, openAt: dates.openAt, deadline: dates.deadline, scheduledCloseAt: dates.scheduledCloseAt, taskCount: created.length },
    })
    return { cycleId: cycle.id, number, taskCount: created.length }
  })
}

/** §4 Early close: remaining non-final tasks become Cancelled (logged). Relative recurrence is unaffected. */
export async function closeCycleEarly(actor: SecurityActor, cycleId: string, reason: string, now: Date, db: Db = prisma): Promise<{ cancelled: number }> {
  requireCapability(canManageCampaigns(actor), 'Only Security Admins can close a cycle')
  return inTransaction(db, async (tx) => {
    const cycle = await tx.securityCycle.findUnique({ where: { id: cycleId } })
    if (!cycle) throw notFound('Cycle not found')
    if (cycle.actualCloseAt) throw conflict('This cycle is already closed')
    const tasks = await tx.securityTask.findMany({ where: { cycleId }, select: { id: true, status: true, version: true, campaignId: true, cycleId: true } })
    const open = tasks.filter((task) => !isFinalTaskStatus(task.status as TaskStatus))
    let cancelled = 0
    let allCancelled = true
    for (const task of open) {
      // Guarded per task: a verdict that lands concurrently is kept, never overwritten.
      try {
        await transitionTask(
          tx,
          { ...task, status: task.status as TaskStatus },
          'CANCELLED',
          'CANCEL',
          { actorId: actor.id, actorRole: actorRoleLabel(actor), reason: 'Cycle closed early' },
          { cancelReason: 'Cycle closed early', resubmitDueAt: null },
        )
        cancelled += 1
      } catch (error) {
        if (!(error instanceof SecurityChecksError && error.status === 409)) throw error
        allCancelled = false
      }
    }
    await tx.securityCycle.update({
      where: { id: cycleId },
      data: { actualCloseAt: now, status: allCancelled ? 'CLOSED' : 'CLOSING', earlyClosedById: actor.id, earlyCloseReason: reason },
    })
    await appendAuditMany(tx, [
      actorEntry(actor, 'CYCLE_CLOSED_EARLY', 'CYCLE', { targetId: cycleId, campaignId: cycle.campaignId, cycleId, details: { reason, cancelled } }),
    ])
    return { cancelled }
  })
}

/** Moves a cycle OPEN → CLOSING at actual close, and → CLOSED once every task is final. */
export async function settleCycle(cycleId: string, now: Date, db: Db = prisma): Promise<void> {
  const cycle = await db.securityCycle.findUnique({ where: { id: cycleId } })
  if (!cycle || cycle.status === 'CLOSED') return
  const actualCloseAt = cycle.actualCloseAt ?? (now.getTime() >= cycle.scheduledCloseAt.getTime() ? cycle.scheduledCloseAt : null)
  if (!actualCloseAt) return
  const statuses = await db.securityTask.findMany({ where: { cycleId }, select: { status: true } })
  const allFinal = statuses.every((task) => isFinalTaskStatus(task.status as TaskStatus))
  const status = allFinal ? 'CLOSED' : 'CLOSING'
  if (status === cycle.status && cycle.actualCloseAt) return
  await db.securityCycle.update({ where: { id: cycleId }, data: { actualCloseAt, status } })
  await appendAudit(db, systemEntry(status === 'CLOSED' ? 'CYCLE_CLOSED' : 'CYCLE_CLOSING', 'CYCLE', { targetId: cycleId, campaignId: cycle.campaignId, cycleId }))
}

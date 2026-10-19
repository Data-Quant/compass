// §7 Reminder job. Sent reminders are in-app notifications (plus a generic
// email); superseded offsets are recorded as hidden markers so they are
// never sent later.
import { prisma } from '@/lib/db'
import { laterOf } from '../dates'
import { planReminder } from '../reminders'
import type { TaskStatus } from '../types'
import { appendAuditMany, systemEntry } from './audit'
import type { Db } from './db'
import { queueNotifications } from './notifications'

export const REMINDER_MARKER_KIND = 'REMINDER_MARKER'
const reminderDedupe = (taskId: string, key: string) => `reminder:${taskId}:${key}`

export async function runReminders(now: Date, db: Db = prisma): Promise<{ sent: number }> {
  const tasks = await db.securityTask.findMany({
    where: { status: { in: ['NOT_STARTED', 'IN_PROGRESS', 'REJECTED', 'REQUIRES_INFO'] } },
    include: { cycle: { select: { openAt: true, campaign: { select: { name: true, reminderOffsets: true } } } } },
  })
  if (tasks.length === 0) return { sent: 0 }
  const sentRows = await db.securityNotification.findMany({
    where: { taskId: { in: tasks.map((task) => task.id) }, dedupeKey: { startsWith: 'reminder:' } },
    select: { taskId: true, dedupeKey: true },
  })
  const sentByTask = new Map<string, Set<string>>()
  for (const row of sentRows) {
    if (!row.taskId) continue
    const key = row.dedupeKey.slice(`reminder:${row.taskId}:`.length)
    sentByTask.set(row.taskId, (sentByTask.get(row.taskId) ?? new Set()).add(key))
  }

  const notices = []
  const markers = []
  const audits = []
  for (const task of tasks) {
    const plan = planReminder(
      {
        status: task.status as TaskStatus,
        deadline: task.deadline,
        startedAt: laterOf(task.cycle.openAt, task.createdAt),
        offsets: task.cycle.campaign.reminderOffsets,
        lastVerdictAt: task.lastVerdictAt,
        resubmitDueAt: task.resubmitDueAt,
        sentKeys: sentByTask.get(task.id) ?? new Set(),
      },
      now,
    )
    if (!plan.send) continue
    const name = task.cycle.campaign.name
    notices.push({
      userId: task.userId,
      kind: 'REMINDER',
      title: plan.send.kind === 'RETURN_DAY5' ? 'Resubmission window closing' : 'Security check due soon',
      body:
        plan.send.kind === 'RETURN_DAY5'
          ? `Two days left to resubmit “${name}”.`
          : `“${name}” is due in ${plan.send.daysLeft} day${plan.send.daysLeft === 1 ? '' : 's'}.`,
      taskId: task.id,
      dedupeKey: reminderDedupe(task.id, plan.send.key),
    })
    for (const key of plan.markSent.filter((entry) => entry !== plan.send?.key)) {
      markers.push({ userId: task.userId, kind: REMINDER_MARKER_KIND, title: '', body: '', taskId: task.id, dedupeKey: reminderDedupe(task.id, key), emailed: true, readAt: now })
    }
    audits.push(systemEntry('REMINDER_SENT', 'TASK', { targetId: task.id, taskId: task.id, campaignId: task.campaignId, cycleId: task.cycleId, details: { key: plan.send.key } }))
  }
  await queueNotifications(db, notices)
  if (markers.length > 0) await db.securityNotification.createMany({ data: markers, skipDuplicates: true })
  await appendAuditMany(db, audits)
  return { sent: notices.length }
}

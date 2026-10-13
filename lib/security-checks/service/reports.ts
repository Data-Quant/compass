// §7 Weekly overdue digest and §5/§14 monthly self-review report.
import { prisma } from '@/lib/db'
import { canViewSelfReviewReport, type SecurityActor } from '../access'
import { addMonths, karachiDateKey, startOfKarachiDateKey } from '../dates'
import { requireCapability } from './actor'
import { appendAudit, systemEntry } from './audit'
import type { Db } from './db'
import { peopleById } from './directory'
import { SecurityChecksError } from './errors'
import { queueNotifications, securityAdminIds } from './notifications'

/** "Unresolved" = past its own deadline D and Rejected / Requires Additional Information. */
export async function runOverdueDigest(now: Date, db: Db = prisma): Promise<{ unresolved: number; recipients: number }> {
  const unresolved = await db.securityTask.count({ where: { status: { in: ['REJECTED', 'REQUIRES_INFO'] }, deadline: { lt: now } } })
  const admins = unresolved > 0 ? await securityAdminIds(db) : []
  const weekKey = karachiDateKey(now)
  await queueNotifications(
    db,
    admins.map((userId) => ({
      userId,
      kind: 'OVERDUE_DIGEST',
      title: 'Weekly overdue digest',
      body: `${unresolved} task${unresolved === 1 ? ' is' : 's are'} past the deadline with a rejection or information request still open.`,
      dedupeKey: `digest:${weekKey}:${userId}`,
    })),
  )
  await appendAudit(db, systemEntry('JOB_RUN', 'JOB', { targetId: 'overdue-digest', details: { unresolved, recipients: admins.length } }))
  return { unresolved, recipients: admins.length }
}

export interface SelfReviewReportItem {
  at: string
  action: string
  actorName: string
  employeeName: string | null
  campaignId: string | null
  taskId: string | null
  details: unknown
}

function monthRange(monthKey: string): { start: Date; end: Date } {
  const start = startOfKarachiDateKey(`${monthKey}-01`)
  if (!start) throw new SecurityChecksError('Use a YYYY-MM month', 400)
  return { start, end: addMonths(start, 1) }
}

export function previousMonthKey(now: Date): string {
  return karachiDateKey(addMonths(now, -1)).slice(0, 7)
}

async function reportItems(monthKey: string, db: Db): Promise<SelfReviewReportItem[]> {
  const { start, end } = monthRange(monthKey)
  const entries = await db.securityAuditLog.findMany({
    where: { selfReview: true, createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: 'asc' },
  })
  const tasks = await db.securityTask.findMany({
    where: { id: { in: entries.map((entry) => entry.taskId).filter((id): id is string => Boolean(id)) } },
    select: { id: true, userId: true },
  })
  const ownerByTask = new Map(tasks.map((task) => [task.id, task.userId]))
  const people = await peopleById([...entries.map((entry) => entry.actorId ?? ''), ...tasks.map((task) => task.userId)], db)
  return entries.map((entry) => ({
    at: entry.createdAt.toISOString(),
    action: entry.action,
    actorName: people.get(entry.actorId ?? '')?.name ?? 'Unknown person',
    employeeName: entry.taskId ? (people.get(ownerByTask.get(entry.taskId) ?? '')?.name ?? null) : null,
    campaignId: entry.campaignId,
    taskId: entry.taskId,
    details: entry.details,
  }))
}

export async function selfReviewReport(actor: SecurityActor, monthKey: string, db: Db = prisma): Promise<SelfReviewReportItem[]> {
  requireCapability(canViewSelfReviewReport(actor))
  return reportItems(monthKey, db)
}

/** Monthly: tells Console Admins (and Security Admins) the report for last month is ready. */
export async function runSelfReviewReport(now: Date, db: Db = prisma): Promise<{ month: string; items: number; recipients: number }> {
  const month = previousMonthKey(now)
  const items = await reportItems(month, db)
  let recipients: string[] = []
  if (items.length > 0) {
    const [grants, hrUsers] = await Promise.all([
      db.securityConsoleGrant.findMany({ select: { userId: true } }),
      db.user.findMany({ where: { role: 'HR' }, select: { id: true } }),
    ])
    recipients = [...new Set([...grants.map((grant) => grant.userId), ...hrUsers.map((user) => user.id), ...(await securityAdminIds(db))])]
    await queueNotifications(
      db,
      recipients.map((userId) => ({
        userId,
        kind: 'SELF_REVIEW_REPORT',
        title: `Self-review report for ${month}`,
        body: `${items.length} self-review-flagged action${items.length === 1 ? '' : 's'} last month. Open the Security Checks dashboard to see them.`,
        dedupeKey: `self-review:${month}:${userId}`,
      })),
    )
  }
  await appendAudit(db, systemEntry('JOB_RUN', 'JOB', { targetId: 'self-review-report', details: { month, items: items.length, recipients: recipients.length } }))
  return { month, items: items.length, recipients: recipients.length }
}

// §9 CSV export and audit-log listing — Security Admins only.
import { prisma } from '@/lib/db'
import { canExportCsv, canViewAuditLog, type SecurityActor } from '../access'
import { toCsv } from '../csv'
import { karachiDateKey } from '../dates'
import { TASK_STATUS_LABELS, type TaskStatus } from '../types'
import { actorEntry, requireCapability } from './actor'
import { appendAudit } from './audit'
import type { Db } from './db'
import { peopleById } from './directory'

const CSV_HEADER = [
  'Employee',
  'Department',
  'Campaign',
  'Version',
  'Cycle',
  'Status',
  'Deadline',
  'Original deadline',
  'First submitted',
  'Last verdict',
  'Expiry reason',
  'Late enrollment',
  'Extended',
  'Exemption reason',
  'Unreviewed flag',
] as const

const day = (value: Date | null) => (value ? karachiDateKey(value) : '')

export async function exportTasksCsv(actor: SecurityActor, filters: { campaignId?: string; cycleId?: string }, db: Db = prisma): Promise<string> {
  requireCapability(canExportCsv(actor), 'Only Security Admins can export CSV')
  const tasks = await db.securityTask.findMany({
    where: { ...(filters.campaignId ? { campaignId: filters.campaignId } : {}), ...(filters.cycleId ? { cycleId: filters.cycleId } : {}) },
    include: { cycle: { select: { number: true, campaign: { select: { name: true, version: true } } } } },
    orderBy: [{ campaignId: 'asc' }, { createdAt: 'asc' }],
    take: 20000,
  })
  const people = await peopleById(tasks.map((task) => task.userId), db)
  const rows = tasks.map((task) => [
    people.get(task.userId)?.name ?? 'Unknown person',
    people.get(task.userId)?.department ?? '',
    task.cycle.campaign.name,
    task.cycle.campaign.version,
    task.cycle.number,
    TASK_STATUS_LABELS[task.status as TaskStatus],
    day(task.deadline),
    day(task.originalDeadline),
    day(task.firstSubmittedAt),
    day(task.lastVerdictAt),
    task.expiryReason ?? '',
    task.lateEnrollment ? 'Yes' : 'No',
    task.extendedAt ? 'Yes' : 'No',
    task.exemptionReason ?? '',
    task.unreviewedFlag ? 'Yes' : 'No',
  ])
  await appendAudit(db, actorEntry(actor, 'CSV_EXPORTED', 'EXPORT', { campaignId: filters.campaignId ?? null, cycleId: filters.cycleId ?? null, details: { rows: rows.length } }))
  return toCsv(CSV_HEADER, rows)
}

export interface AuditLogView {
  id: string
  at: string
  actorName: string
  actorRole: string
  action: string
  targetType: string
  targetId: string | null
  campaignId: string | null
  taskId: string | null
  selfReview: boolean
  details: unknown
}

export async function listAuditLog(
  actor: SecurityActor,
  filters: { campaignId?: string; taskId?: string; action?: string; selfReviewOnly?: boolean; before?: string },
  db: Db = prisma,
): Promise<{ entries: AuditLogView[]; nextBefore: string | null }> {
  requireCapability(canViewAuditLog(actor), 'Only Security Admins can see the audit log')
  const limit = 100
  const before = filters.before ? new Date(filters.before) : null
  const entries = await db.securityAuditLog.findMany({
    where: {
      ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
      ...(filters.taskId ? { taskId: filters.taskId } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.selfReviewOnly ? { selfReview: true } : {}),
      ...(before && !Number.isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  })
  const page = entries.slice(0, limit)
  const people = await peopleById(page.map((entry) => entry.actorId ?? ''), db)
  return {
    entries: page.map((entry) => ({
      id: entry.id,
      at: entry.createdAt.toISOString(),
      actorName: entry.actorId ? (people.get(entry.actorId)?.name ?? 'Unknown person') : 'System',
      actorRole: entry.actorRole,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      campaignId: entry.campaignId,
      taskId: entry.taskId,
      selfReview: entry.selfReview,
      details: entry.details,
    })),
    nextBefore: entries.length > limit ? page[page.length - 1].createdAt.toISOString() : null,
  }
}

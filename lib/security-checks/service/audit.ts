// §9 Append-only audit trail. Deliberately exposes no update or delete
// operation; the retention job is the sole removal path.
import { type Db, toJson } from './db'

export const SYSTEM_ACTOR_ROLE = 'SYSTEM'

export interface AuditEntry {
  actorId: string | null
  actorRole: string
  action: string
  targetType: string
  targetId?: string | null
  campaignId?: string | null
  cycleId?: string | null
  taskId?: string | null
  selfReview?: boolean
  details?: unknown
}

function toRow(entry: AuditEntry) {
  return {
    actorId: entry.actorId,
    actorRole: entry.actorRole,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    campaignId: entry.campaignId ?? null,
    cycleId: entry.cycleId ?? null,
    taskId: entry.taskId ?? null,
    selfReview: entry.selfReview ?? false,
    details: entry.details === undefined ? undefined : toJson(entry.details),
  }
}

export async function appendAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.securityAuditLog.create({ data: toRow(entry) })
}

export async function appendAuditMany(db: Db, entries: readonly AuditEntry[]): Promise<void> {
  if (entries.length === 0) return
  await db.securityAuditLog.createMany({ data: entries.map(toRow) })
}

export function systemEntry(action: string, targetType: string, rest: Omit<AuditEntry, 'actorId' | 'actorRole' | 'action' | 'targetType'> = {}): AuditEntry {
  return { actorId: null, actorRole: SYSTEM_ACTOR_ROLE, action, targetType, ...rest }
}

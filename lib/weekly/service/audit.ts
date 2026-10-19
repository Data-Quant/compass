import { toJson, type Db } from './db'

export interface WeeklyAuditInput {
  cycleId?: string | null
  actorId: string | null
  actorRole: string
  action: string
  objectType: string
  objectId?: string | null
  before?: unknown
  after?: unknown
  reason?: string | null
}

/** Insert-only: there is deliberately no update or delete helper. */
export async function recordAudit(db: Db, event: WeeklyAuditInput): Promise<void> {
  await db.weeklyAuditEvent.create({
    data: {
      cycleId: event.cycleId ?? null,
      actorId: event.actorId,
      actorRole: event.actorRole,
      action: event.action,
      objectType: event.objectType,
      objectId: event.objectId ?? null,
      before: event.before === undefined ? undefined : toJson(event.before),
      after: event.after === undefined ? undefined : toJson(event.after),
      reason: event.reason ?? null,
    },
  })
}

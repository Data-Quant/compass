import type { KpiStatus } from '@prisma/client'
import { type Db, toJson } from './db'

export interface KpiEventInput {
  kpiId?: string
  kpiMonthId?: string
  actorId: string | null
  actorRole: string
  action: string
  fromStatus?: KpiStatus
  toStatus?: KpiStatus
  before?: unknown
  after?: unknown
  reason?: string
}

/** Append-only audit record. There is deliberately no update or delete helper. */
export async function recordEvent(db: Db, event: KpiEventInput): Promise<void> {
  await db.kpiEvent.create({
    data: {
      kpiId: event.kpiId ?? null,
      kpiMonthId: event.kpiMonthId ?? null,
      actorId: event.actorId,
      actorRole: event.actorRole,
      action: event.action,
      fromStatus: event.fromStatus ?? null,
      toStatus: event.toStatus ?? null,
      before: event.before === undefined ? undefined : toJson(event.before),
      after: event.after === undefined ? undefined : toJson(event.after),
      reason: event.reason ?? null,
    },
  })
}

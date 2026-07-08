import { Prisma } from '@prisma/client'
import { prisma } from './db'

// Canonical asset lifecycle event types. All EquipmentEvent rows use one of these
// so the timeline formatter can render them consistently.
export const ASSET_EVENT_TYPES = {
  CREATED: 'ASSET_CREATED',
  UPDATED: 'ASSET_UPDATED',
  ASSIGNED: 'ASSET_ASSIGNED',
  UNASSIGNED: 'ASSET_UNASSIGNED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  CONDITION_CHANGED: 'CONDITION_CHANGED',
  IMPORTED_CREATED: 'ASSET_IMPORTED_CREATED',
  IMPORTED_UPDATED: 'ASSET_IMPORTED_UPDATED',
  MIGRATED: 'ASSET_MIGRATED',
} as const

export type AssetEventType = (typeof ASSET_EVENT_TYPES)[keyof typeof ASSET_EVENT_TYPES]

type AssetEventClient = typeof prisma | Prisma.TransactionClient

interface RecordAssetEventInput {
  assetId: string
  actorId: string | null
  eventType: AssetEventType
  payload?: Record<string, unknown> | null
}

/** Single write path for asset lifecycle events; use inside or outside a transaction. */
export function recordAssetEvent(client: AssetEventClient, input: RecordAssetEventInput) {
  return client.equipmentEvent.create({
    data: {
      assetId: input.assetId,
      actorId: input.actorId,
      eventType: input.eventType,
      payloadJson:
        input.payload == null ? Prisma.JsonNull : (input.payload as Prisma.InputJsonValue),
    },
  })
}

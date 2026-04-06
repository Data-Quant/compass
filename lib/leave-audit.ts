import { prisma } from '@/lib/db'
import type { Prisma, LeaveAuditChannel, LeaveAuditEventType, LeaveAuditStatus } from '@prisma/client'

type DbClient = typeof prisma | Prisma.TransactionClient

function normalizeRecipients(recipients: Array<string | null | undefined> | null | undefined) {
  const values = (recipients || [])
    .map((recipient) => recipient?.trim().toLowerCase())
    .filter(Boolean) as string[]

  return values.length > 0 ? [...new Set(values)].sort((a, b) => a.localeCompare(b)) : null
}

function formatErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return null
}

export async function recordLeaveAuditEvent(
  input: {
    leaveRequestId: string
    actorId?: string | null
    channel: LeaveAuditChannel
    eventType: LeaveAuditEventType
    status: LeaveAuditStatus
    recipients?: Array<string | null | undefined> | null
    subject?: string | null
    providerMessageId?: string | null
    metadata?: Prisma.InputJsonValue
    error?: unknown
  },
  db: DbClient = prisma
) {
  const normalizedRecipients = normalizeRecipients(input.recipients)

  return db.leaveAuditEvent.create({
    data: {
      leaveRequestId: input.leaveRequestId,
      actorId: input.actorId || null,
      channel: input.channel,
      eventType: input.eventType,
      status: input.status,
      recipients: normalizedRecipients ?? undefined,
      subject: input.subject || null,
      providerMessageId: input.providerMessageId || null,
      metadata: input.metadata ?? undefined,
      errorMessage: formatErrorMessage(input.error),
    },
  })
}

export async function safeRecordLeaveAuditEvent(
  input: Parameters<typeof recordLeaveAuditEvent>[0],
  db?: DbClient
) {
  try {
    await recordLeaveAuditEvent(input, db)
  } catch (error) {
    console.error('[leave-audit] Failed to record leave audit event', {
      leaveRequestId: input.leaveRequestId,
      eventType: input.eventType,
      channel: input.channel,
      error,
    })
  }
}

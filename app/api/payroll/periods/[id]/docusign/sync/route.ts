import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManagePayroll } from '@/lib/permissions'
import { getDocuSignEnvelopeStatus } from '@/lib/docusign'

export const runtime = 'nodejs'

const syncSchema = z.object({
  envelopeIds: z.array(z.string().trim().min(1)).optional(),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

function mapEnvelopeStatusToReceiptStatus(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === 'completed') return 'COMPLETED' as const
  if (normalized === 'sent' || normalized === 'delivered') return 'SENT' as const
  if (normalized === 'created') return 'ENVELOPE_CREATED' as const
  if (normalized === 'declined' || normalized === 'voided') return 'FAILED' as const
  return 'ENVELOPE_CREATED' as const
}

function derivePeriodStatus(receiptStatuses: string[]): 'SENT' | 'PARTIAL' | 'FAILED' {
  if (receiptStatuses.length === 0) return 'FAILED'
  const completedOrSent = receiptStatuses.filter(
    (status) => status === 'COMPLETED' || status === 'SENT' || status === 'ENVELOPE_CREATED'
  ).length
  const failed = receiptStatuses.filter((status) => status === 'FAILED').length

  if (failed === 0 && completedOrSent > 0) return 'SENT'
  if (completedOrSent === 0 && failed > 0) return 'FAILED'
  return 'PARTIAL'
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: periodId } = await context.params
    const period = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      select: { id: true },
    })
    if (!period) {
      return NextResponse.json({ error: 'Payroll period not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const parsed = syncSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const envelopes = await prisma.payrollDocuSignEnvelope.findMany({
      where: {
        ...(parsed.data.envelopeIds?.length
          ? { envelopeId: { in: parsed.data.envelopeIds } }
          : { envelopeId: { not: null } }),
        receipt: { periodId },
      },
      include: {
        receipt: { select: { id: true } },
      },
    })

    if (envelopes.length === 0) {
      return NextResponse.json({
        success: true,
        updated: 0,
        skipped: 0,
      })
    }

    let updated = 0
    const failures: Array<{ envelopeId: string; reason: string }> = []

    for (const envelope of envelopes) {
      if (!envelope.envelopeId) continue
      try {
        const status = await getDocuSignEnvelopeStatus(envelope.envelopeId)
        const receiptStatus = mapEnvelopeStatusToReceiptStatus(status.status)

        await prisma.$transaction(async (tx) => {
          await tx.payrollDocuSignEnvelope.update({
            where: { id: envelope.id },
            data: {
              status: status.status,
              sentAt: status.sentAt,
              completedAt: status.completedAt,
              lastSyncedAt: new Date(),
              errorMessage: null,
            },
          })

          await tx.payrollReceipt.update({
            where: { id: envelope.receiptId },
            data: {
              status: receiptStatus,
            },
          })
        })

        updated += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown DocuSign sync error'
        failures.push({ envelopeId: envelope.envelopeId, reason: message })
        await prisma.payrollDocuSignEnvelope.update({
          where: { id: envelope.id },
          data: {
            status: 'failed',
            errorMessage: message,
            lastSyncedAt: new Date(),
          },
        })
      }
    }

    const receiptStatuses = await prisma.payrollReceipt.findMany({
      where: { periodId },
      select: { status: true },
    })

    const nextStatus = derivePeriodStatus(receiptStatuses.map((r) => r.status))
    await prisma.payrollPeriod.update({
      where: { id: periodId },
      data: { status: nextStatus },
    })

    return NextResponse.json({
      success: failures.length === 0,
      updated,
      failedCount: failures.length,
      failures,
      periodStatus: nextStatus,
    })
  } catch (error) {
    console.error('Failed to sync DocuSign statuses:', error)
    return NextResponse.json({ error: 'Failed to sync DocuSign statuses' }, { status: 500 })
  }
}

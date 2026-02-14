import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManagePayroll } from '@/lib/permissions'
import { getDocuSignRuntimeConfig } from '@/lib/payroll/config'
import { createDocuSignEnvelope } from '@/lib/docusign'

export const runtime = 'nodejs'

const sendSchema = z.object({
  receiptIds: z.array(z.string().trim().min(1)).optional(),
  resendFailedOnly: z.boolean().optional().default(false),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

function toReceiptStatus(envelopeStatus: string) {
  const normalized = envelopeStatus.toLowerCase()
  if (normalized === 'completed') return 'COMPLETED' as const
  if (normalized === 'sent' || normalized === 'delivered') return 'SENT' as const
  return 'ENVELOPE_CREATED' as const
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: periodId } = await context.params
    const body = await request.json().catch(() => ({}))
    const parsed = sendSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const period = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: {
        receipts: {
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
        },
      },
    })

    if (!period) {
      return NextResponse.json({ error: 'Payroll period not found' }, { status: 404 })
    }

    if (period.status !== 'APPROVED') {
      return NextResponse.json(
        { error: `DocuSign send is only allowed from APPROVED. Current status: ${period.status}` },
        { status: 400 }
      )
    }

    const activeConfig = await prisma.payrollConfig.findFirst({
      where: { active: true },
      orderBy: { updatedAt: 'desc' },
    })
    if (!activeConfig) {
      return NextResponse.json(
        { error: 'Payroll DocuSign template configuration is missing. Configure /api/payroll/config first.' },
        { status: 400 }
      )
    }

    const runtimeConfig = getDocuSignRuntimeConfig()
    if (!runtimeConfig.ready) {
      return NextResponse.json(
        {
          error: 'DocuSign runtime configuration is missing required environment variables.',
          missing: runtimeConfig.missing,
        },
        { status: 400 }
      )
    }

    const requestedIds = new Set(parsed.data.receiptIds || [])
    let receipts = period.receipts
    if (requestedIds.size > 0) {
      receipts = receipts.filter((receipt) => requestedIds.has(receipt.id))
    } else if (parsed.data.resendFailedOnly) {
      receipts = receipts.filter((receipt) => receipt.status === 'FAILED')
    } else {
      receipts = receipts.filter((receipt) => receipt.status === 'READY' || receipt.status === 'FAILED')
    }

    if (receipts.length === 0) {
      return NextResponse.json(
        { error: 'No receipts are eligible for DocuSign sending for the requested criteria.' },
        { status: 400 }
      )
    }

    await prisma.payrollPeriod.update({
      where: { id: periodId },
      data: { status: 'SENDING' },
    })

    const failures: Array<{ receiptId: string; payrollName: string; reason: string }> = []
    let successCount = 0

    for (const receipt of receipts) {
      const recipientName = receipt.user?.name || receipt.payrollName
      const recipientEmail = receipt.user?.email?.trim()

      if (!recipientEmail) {
        failures.push({
          receiptId: receipt.id,
          payrollName: receipt.payrollName,
          reason: 'Mapped employee does not have an email address',
        })
        await prisma.payrollReceipt.update({
          where: { id: receipt.id },
          data: { status: 'FAILED' },
        })
        continue
      }

      try {
        const envelope = await createDocuSignEnvelope({
          templateId: activeConfig.templateId,
          templateRoleName: activeConfig.templateRoleName || 'Employee',
          recipientName,
          recipientEmail,
        })

        await prisma.$transaction(async (tx) => {
          await tx.payrollDocuSignEnvelope.create({
            data: {
              receiptId: receipt.id,
              envelopeId: envelope.envelopeId || null,
              recipientName,
              recipientEmail,
              status: envelope.status || 'sent',
              sentAt: envelope.status?.toLowerCase() === 'sent' ? new Date() : null,
              lastSyncedAt: new Date(),
              errorMessage: null,
            },
          })

          await tx.payrollReceipt.update({
            where: { id: receipt.id },
            data: {
              status: toReceiptStatus(envelope.status || 'sent'),
            },
          })
        })

        successCount += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown DocuSign send error'
        failures.push({
          receiptId: receipt.id,
          payrollName: receipt.payrollName,
          reason: message,
        })

        await prisma.$transaction(async (tx) => {
          await tx.payrollDocuSignEnvelope.create({
            data: {
              receiptId: receipt.id,
              envelopeId: null,
              recipientName,
              recipientEmail,
              status: 'failed',
              errorMessage: message,
              lastSyncedAt: new Date(),
            },
          })

          await tx.payrollReceipt.update({
            where: { id: receipt.id },
            data: { status: 'FAILED' },
          })
        })
      }
    }

    const failedCount = failures.length
    const nextStatus =
      successCount === 0 ? 'FAILED' : failedCount > 0 ? 'PARTIAL' : 'SENT'

    await prisma.payrollPeriod.update({
      where: { id: periodId },
      data: { status: nextStatus },
    })

    return NextResponse.json({
      success: failedCount === 0,
      status: nextStatus,
      sentCount: successCount,
      failedCount,
      failures,
    })
  } catch (error) {
    console.error('Failed to send payroll receipts to DocuSign:', error)
    return NextResponse.json({ error: 'Failed to send payroll receipts to DocuSign' }, { status: 500 })
  }
}

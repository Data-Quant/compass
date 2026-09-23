import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManagePayroll } from '@/lib/permissions'
import { getPayslipMailRuntimeConfig } from '@/lib/payroll/config'
import { sendMailWithAttachments } from '@/lib/email'
import { generatePayslipPdf } from '@/lib/payroll/receipt-pdf'
import { receiptToPayslipData } from '@/lib/payroll/payslip-data'
import { buildPayslipEmail, resolvePayslipCc } from '@/lib/payroll/payslip-email'
import { isSendableReceipt } from '@/lib/payroll/payments'

export const runtime = 'nodejs'

const sendSchema = z.object({
  receiptIds: z.array(z.string().trim().min(1)).optional(),
  resendFailedOnly: z.boolean().optional().default(false),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

const SENDABLE_PERIOD_STATUSES: ReadonlyArray<string> = ['APPROVED', 'SENT', 'PARTIAL', 'FAILED']

const DELIVERY_STATUS = {
  sent: 'sent',
  failed: 'failed',
} as const

interface SendFailure {
  receiptId: string
  payrollName: string
  reason: string
}

function derivePeriodStatus(successCount: number, failedCount: number): 'SENT' | 'PARTIAL' | 'FAILED' {
  if (successCount === 0) return 'FAILED'
  return failedCount > 0 ? 'PARTIAL' : 'SENT'
}

async function recordDelivery(input: {
  receiptId: string
  recipientName: string
  recipientEmail: string
  messageId: string | null
  errorMessage: string | null
}) {
  const succeeded = input.errorMessage === null
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    // The envelope table is reused as the pay slip delivery log; envelopeId
    // now holds the mail transport's message id.
    await tx.payrollDocuSignEnvelope.create({
      data: {
        receiptId: input.receiptId,
        envelopeId: input.messageId,
        recipientName: input.recipientName,
        recipientEmail: input.recipientEmail,
        status: succeeded ? DELIVERY_STATUS.sent : DELIVERY_STATUS.failed,
        sentAt: succeeded ? now : null,
        completedAt: succeeded ? now : null,
        lastSyncedAt: now,
        errorMessage: input.errorMessage,
      },
    })

    await tx.payrollReceipt.update({
      where: { id: input.receiptId },
      data: { status: succeeded ? 'SENT' : 'FAILED' },
    })
  })
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
              select: {
                id: true,
                name: true,
                email: true,
                department: true,
                payrollProfile: {
                  select: {
                    designation: true,
                    cnicNumber: true,
                    accountNumber: true,
                    officialEmail: true,
                    department: { select: { name: true } },
                    employmentType: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
        payments: { select: { payrollName: true, paidAmount: true } },
      },
    })

    if (!period) {
      return NextResponse.json({ error: 'Payroll period not found' }, { status: 404 })
    }

    // Send runs from APPROVED (first send) and re-runs from SENT/PARTIAL to
    // dispatch held-then-paid receipts, or from FAILED to retry a run where
    // every email bounced (bad mail credentials, provider outage). SENDING is
    // transient and excluded so a re-run cannot collide with a send in flight.
    if (!SENDABLE_PERIOD_STATUSES.includes(period.status)) {
      return NextResponse.json(
        { error: `Sending is only allowed from an approved or sent period. Current status: ${period.status}` },
        { status: 400 }
      )
    }

    const mailConfig = getPayslipMailRuntimeConfig()
    if (!mailConfig.ready) {
      return NextResponse.json(
        {
          error: 'Email configuration is missing required environment variables.',
          missing: mailConfig.missing,
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

    // Skip employees held at 0 paid -- they get no pay slip until paid. Applies
    // to every trigger (default, resend, targeted) so a held salary is never
    // dispatched by any path.
    const paidByName = new Map<string, number>()
    for (const p of period.payments) {
      paidByName.set(p.payrollName, (paidByName.get(p.payrollName) ?? 0) + p.paidAmount)
    }
    const eligibleByStatus = receipts.length
    receipts = receipts.filter((receipt) =>
      isSendableReceipt(receipt.status, paidByName.get(receipt.payrollName) ?? 0)
    )
    const heldSkipped = eligibleByStatus - receipts.length

    if (receipts.length === 0) {
      return NextResponse.json(
        {
          error:
            heldSkipped > 0
              ? 'No paid employees to send. Record payments first, or every remaining employee is held at 0.'
              : 'No pay slips are eligible for sending for the requested criteria.',
        },
        { status: 400 }
      )
    }

    await prisma.payrollPeriod.update({
      where: { id: periodId },
      data: { status: 'SENDING' },
    })

    const failures: SendFailure[] = []
    let successCount = 0

    // Whatever happens inside the loop, the period must leave SENDING: the
    // send guard excludes SENDING, so a stranded period could never be retried.
    try {
      for (const receipt of receipts) {
        const profile = receipt.user?.payrollProfile
        const recipientName = receipt.user?.name || receipt.payrollName
        const recipientEmail = (receipt.user?.email || profile?.officialEmail || '').trim()

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
          const payslipData = receiptToPayslipData({
            receiptJson: receipt.receiptJson,
            payrollName: receipt.payrollName,
            periodLabel: period.label,
            profile: profile
              ? {
                  designation: profile.designation,
                  cnicNumber: profile.cnicNumber,
                  accountNumber: profile.accountNumber,
                  departmentName: profile.department?.name ?? receipt.user?.department ?? null,
                  employmentTypeName: profile.employmentType?.name ?? null,
                }
              : { departmentName: receipt.user?.department ?? null },
          })
          const pdfBuffer = await generatePayslipPdf(payslipData)
          const email = buildPayslipEmail({
            employeeName: receipt.payrollName,
            periodLabel: period.label,
          })

          const info = await sendMailWithAttachments({
            to: recipientEmail,
            cc: resolvePayslipCc(process.env.PAYSLIP_CC_EMAILS, recipientEmail),
            subject: email.subject,
            html: email.html,
            text: email.text,
            attachments: [{ filename: email.fileName, content: pdfBuffer, contentType: 'application/pdf' }],
          })

          await recordDelivery({
            receiptId: receipt.id,
            recipientName,
            recipientEmail,
            messageId: info.messageId || null,
            errorMessage: null,
          })

          successCount += 1
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown email send error'
          console.error(`Pay slip send failed for ${receipt.payrollName} (${receipt.id}):`, error)
          failures.push({ receiptId: receipt.id, payrollName: receipt.payrollName, reason: message })

          // Bookkeeping must not abort the batch: if the failure record cannot
          // be written the period would be stranded in SENDING with no retry path.
          try {
            await recordDelivery({
              receiptId: receipt.id,
              recipientName,
              recipientEmail,
              messageId: null,
              errorMessage: message,
            })
          } catch (recordError) {
            console.error(`Failed to record pay slip failure for ${receipt.id}:`, recordError)
          }
        }
      }
    } finally {
      await prisma.payrollPeriod.update({
        where: { id: periodId },
        data: { status: derivePeriodStatus(successCount, failures.length) },
      })
    }

    const failedCount = failures.length
    const nextStatus = derivePeriodStatus(successCount, failedCount)

    return NextResponse.json({
      success: failedCount === 0,
      status: nextStatus,
      sentCount: successCount,
      failedCount,
      failures,
    })
  } catch (error) {
    console.error('Failed to email pay slips:', error)
    return NextResponse.json({ error: 'Failed to email pay slips' }, { status: 500 })
  }
}

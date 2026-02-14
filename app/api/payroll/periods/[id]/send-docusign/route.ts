import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManagePayroll } from '@/lib/permissions'
import { getHelloSignRuntimeConfig } from '@/lib/payroll/config'
import { sendHelloSignRequest } from '@/lib/hellosign'
import { generateReceiptPdf, type ReceiptData } from '@/lib/payroll/receipt-pdf'

export const runtime = 'nodejs'

const sendSchema = z.object({
  receiptIds: z.array(z.string().trim().min(1)).optional(),
  resendFailedOnly: z.boolean().optional().default(false),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

function toReceiptStatus(helloSignStatus: string) {
  const normalized = helloSignStatus.toLowerCase()
  if (normalized === 'completed' || normalized === 'signed') return 'COMPLETED' as const
  if (normalized === 'sent' || normalized === 'partially_signed') return 'SENT' as const
  if (normalized === 'declined' || normalized === 'error') return 'FAILED' as const
  return 'ENVELOPE_CREATED' as const
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function receiptJsonToData(
  receiptJson: any,
  payrollName: string,
  periodLabel: string,
): ReceiptData {
  const earnings = receiptJson?.earnings || {}
  const deductions = receiptJson?.deductions || {}
  const net = receiptJson?.net || {}

  return {
    employeeName: payrollName,
    periodLabel,
    earnings: {
      basicSalary: num(earnings.basicSalary),
      medicalTaxExemption: num(earnings.medicalTaxExemption),
      bonus: num(earnings.bonus),
      medicalAllowance: num(earnings.medicalAllowance),
      travelReimbursement: num(earnings.travelReimbursement),
      utilityReimbursement: num(earnings.utilityReimbursement),
      mealsReimbursement: num(earnings.mealsReimbursement),
      mobileReimbursement: num(earnings.mobileReimbursement),
      expenseReimbursement: num(earnings.expenseReimbursement),
      advanceLoan: num(earnings.advanceLoan),
      totalEarnings: num(earnings.totalEarnings),
    },
    deductions: {
      incomeTax: num(deductions.incomeTax),
      adjustment: num(deductions.adjustment),
      loanRepayment: num(deductions.loanRepayment),
      totalDeductions: num(deductions.totalDeductions),
    },
    net: {
      netSalary: num(net.netSalary),
      paid: num(net.paid),
      balance: num(net.balance),
    },
  }
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
        { error: `Sending receipts is only allowed from APPROVED status. Current status: ${period.status}` },
        { status: 400 }
      )
    }

    const runtimeConfig = getHelloSignRuntimeConfig()
    if (!runtimeConfig.ready) {
      return NextResponse.json(
        {
          error: 'HelloSign configuration is missing required environment variables.',
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
        { error: 'No receipts are eligible for sending for the requested criteria.' },
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
        // Generate the PDF receipt
        const receiptData = receiptJsonToData(
          receipt.receiptJson,
          receipt.payrollName,
          period.label,
        )
        const pdfBuffer = await generateReceiptPdf(receiptData)
        const sanitizedName = receipt.payrollName.replace(/[^a-zA-Z0-9 ]/g, '').trim()
        const fileName = `Payment_Receipt_${sanitizedName}_${period.label.replace(/\s+/g, '_')}.pdf`

        // Send via HelloSign
        const result = await sendHelloSignRequest({
          fileBuffer: pdfBuffer,
          fileName,
          signerName: recipientName,
          signerEmail: recipientEmail,
          subject: `Payment Receipt - ${receipt.payrollName} - ${period.label}`,
          message: `Please review and sign your payment receipt for ${period.label}.`,
          testMode: runtimeConfig.testMode,
        })

        await prisma.$transaction(async (tx) => {
          // Store in the existing envelope table (repurposed for HelloSign)
          await tx.payrollDocuSignEnvelope.create({
            data: {
              receiptId: receipt.id,
              envelopeId: result.signatureRequestId || null,
              recipientName,
              recipientEmail,
              status: result.status || 'sent',
              sentAt: new Date(),
              lastSyncedAt: new Date(),
              errorMessage: null,
            },
          })

          await tx.payrollReceipt.update({
            where: { id: receipt.id },
            data: {
              status: toReceiptStatus(result.status || 'sent'),
            },
          })
        })

        successCount += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown HelloSign send error'
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
    console.error('Failed to send payroll receipts via HelloSign:', error)
    return NextResponse.json({ error: 'Failed to send payroll receipts' }, { status: 500 })
  }
}

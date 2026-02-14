import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import crypto from 'crypto'

function mapToReceiptStatus(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === 'completed') return 'COMPLETED'
  if (normalized === 'sent' || normalized === 'delivered') return 'SENT'
  if (normalized === 'declined' || normalized === 'voided') return 'FAILED'
  return 'ENVELOPE_CREATED'
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const hmacKey = process.env.DOCUSIGN_WEBHOOK_HMAC_KEY || ''
    const signatureHeader = request.headers.get('x-docusign-signature-1') || ''

    if (hmacKey) {
      if (!signatureHeader) {
        return NextResponse.json({ error: 'Missing DocuSign signature header' }, { status: 401 })
      }
      const computed = crypto
        .createHmac('sha256', hmacKey)
        .update(rawBody, 'utf8')
        .digest('base64')

      const providedBytes = Buffer.from(signatureHeader.trim(), 'utf8')
      const computedBytes = Buffer.from(computed, 'utf8')
      const valid =
        providedBytes.length === computedBytes.length &&
        crypto.timingSafeEqual(providedBytes, computedBytes)

      if (!valid) {
        return NextResponse.json({ error: 'Invalid DocuSign webhook signature' }, { status: 401 })
      }
    }

    const body = rawBody ? JSON.parse(rawBody) : null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: true })
    }

    const envelopeId =
      (body as any)?.data?.envelopeId ||
      (body as any)?.envelopeId ||
      (body as any)?.EnvelopeId
    const statusRaw =
      (body as any)?.data?.status ||
      (body as any)?.status ||
      (body as any)?.Status

    if (!envelopeId || !statusRaw) {
      return NextResponse.json({ success: true })
    }

    const status = String(statusRaw)
    const updated = await prisma.payrollDocuSignEnvelope.updateMany({
      where: { envelopeId: String(envelopeId) },
      data: {
        status,
        lastSyncedAt: new Date(),
        sentAt: status.toLowerCase() === 'sent' ? new Date() : undefined,
        completedAt: status.toLowerCase() === 'completed' ? new Date() : undefined,
      },
    })

    const envelope = await prisma.payrollDocuSignEnvelope.findFirst({
      where: { envelopeId: String(envelopeId) },
      select: { receiptId: true },
    })
    if (envelope) {
      await prisma.payrollReceipt.update({
        where: { id: envelope.receiptId },
        data: { status: mapToReceiptStatus(status) as any },
      })
    }

    return NextResponse.json({ success: true, updated: updated.count })
  } catch (error) {
    console.error('Payroll DocuSign webhook processing failed:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

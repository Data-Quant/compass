/**
 * HelloSign (Dropbox Sign) webhook handler.
 *
 * HelloSign sends event callbacks as JSON to this endpoint.
 * Event types: https://developers.hellosign.com/api/reference/tag/Callbacks-and-Events
 *
 * HMAC verification is performed when HELLOSIGN_WEBHOOK_SECRET is configured.
 * The handler responds with "Hello API Event Received" as required by HelloSign.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseHelloSignWebhookPayload, verifyHelloSignWebhookSignature } from '@/lib/payroll/hellosign-webhook'

function mapToReceiptStatus(eventType: string) {
  if (eventType === 'signature_request_signed' || eventType === 'signature_request_all_signed') {
    return 'COMPLETED'
  }
  if (eventType === 'signature_request_sent' || eventType === 'signature_request_viewed') {
    return 'SENT'
  }
  if (eventType === 'signature_request_declined' || eventType === 'signature_request_invalid' || eventType === 'signature_request_canceled') {
    return 'FAILED'
  }
  return null // Unknown event, don't update
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const webhookSecret = process.env.HELLOSIGN_WEBHOOK_SECRET || ''

    if (webhookSecret && !verifyHelloSignWebhookSignature(rawBody, webhookSecret)) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
    }

    // HelloSign may send as form-encoded with a `json` field, or as raw JSON
    const body = parseHelloSignWebhookPayload(rawBody)

    if (!body || typeof body !== 'object') {
      return new Response('Hello API Event Received', { status: 200 })
    }

    const eventType = body?.event?.event_type as string | undefined
    const signatureRequestId =
      body?.signature_request?.signature_request_id as string | undefined

    if (!eventType || !signatureRequestId) {
      return new Response('Hello API Event Received', { status: 200 })
    }

    const receiptStatus = mapToReceiptStatus(eventType)
    if (!receiptStatus) {
      // Unknown or irrelevant event type, acknowledge
      return new Response('Hello API Event Received', { status: 200 })
    }

    // Determine completion details
    const isComplete = eventType === 'signature_request_all_signed'
    const now = new Date()

    // Update the envelope record (envelopeId stores signatureRequestId)
    await prisma.payrollDocuSignEnvelope.updateMany({
      where: { envelopeId: signatureRequestId },
      data: {
        status: eventType,
        lastSyncedAt: now,
        ...(isComplete ? { completedAt: now } : {}),
      },
    })

    // Update the associated receipt status
    const envelope = await prisma.payrollDocuSignEnvelope.findFirst({
      where: { envelopeId: signatureRequestId },
      select: { receiptId: true },
    })

    if (envelope) {
      await prisma.payrollReceipt.update({
        where: { id: envelope.receiptId },
        data: { status: receiptStatus as any },
      })
    }

    // HelloSign requires "Hello API Event Received" as the response body
    return new Response('Hello API Event Received', { status: 200 })
  } catch (error) {
    console.error('Payroll HelloSign webhook processing failed:', error)
    return new Response('Hello API Event Received', { status: 200 })
  }
}

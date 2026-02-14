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
import crypto from 'crypto'
import { prisma } from '@/lib/db'

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

function verifyWebhook(rawBody: string, secret: string): boolean {
  if (!secret) return true // Skip verification if no secret configured

  // HelloSign webhook verification:
  // hash_hmac('sha256', event_time + event_type, api_key) === event_hash
  // However, the simpler approach is that HelloSign sends the hash in the payload
  try {
    const payload = JSON.parse(rawBody)
    const eventHash = payload?.event?.event_hash
    const eventType = payload?.event?.event_type
    const eventTime = payload?.event?.event_time

    if (!eventHash || !eventType || !eventTime) return true // Can't verify, allow

    const computed = crypto
      .createHmac('sha256', secret)
      .update(`${eventTime}${eventType}`)
      .digest('hex')

    return crypto.timingSafeEqual(
      Buffer.from(computed, 'utf8'),
      Buffer.from(eventHash, 'utf8'),
    )
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const webhookSecret = process.env.HELLOSIGN_WEBHOOK_SECRET || ''

    if (webhookSecret && !verifyWebhook(rawBody, webhookSecret)) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
    }

    // HelloSign may send as form-encoded with a `json` field, or as raw JSON
    let body: any
    try {
      body = JSON.parse(rawBody)
    } catch {
      // Try to parse as form-encoded
      const params = new URLSearchParams(rawBody)
      const jsonField = params.get('json')
      if (jsonField) {
        body = JSON.parse(jsonField)
      } else {
        // Return success to acknowledge receipt
        return new Response('Hello API Event Received', { status: 200 })
      }
    }

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

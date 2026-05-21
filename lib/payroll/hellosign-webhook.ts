import crypto from 'crypto'

type HelloSignWebhookPayload = {
  event?: {
    event_hash?: unknown
    event_type?: unknown
    event_time?: unknown
  }
  signature_request?: {
    signature_request_id?: unknown
  }
}

export function parseHelloSignWebhookPayload(rawBody: string): HelloSignWebhookPayload | null {
  try {
    const parsed = JSON.parse(rawBody)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    const params = new URLSearchParams(rawBody)
    const jsonField = params.get('json')
    if (!jsonField) return null

    try {
      const parsed = JSON.parse(jsonField)
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  }
}

export function verifyHelloSignWebhookSignature(rawBody: string, secret: string): boolean {
  if (!secret) return true

  const payload = parseHelloSignWebhookPayload(rawBody)
  const eventHash = payload?.event?.event_hash
  const eventType = payload?.event?.event_type
  const eventTime = payload?.event?.event_time

  if (
    typeof eventHash !== 'string' ||
    typeof eventType !== 'string' ||
    (typeof eventTime !== 'string' && typeof eventTime !== 'number')
  ) {
    return false
  }

  const computed = crypto
    .createHmac('sha256', secret)
    .update(`${eventTime}${eventType}`)
    .digest('hex')

  const computedBuffer = Buffer.from(computed, 'utf8')
  const receivedBuffer = Buffer.from(eventHash, 'utf8')
  if (computedBuffer.length !== receivedBuffer.length) return false

  return crypto.timingSafeEqual(computedBuffer, receivedBuffer)
}

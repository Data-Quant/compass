import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'crypto'
import {
  parseHelloSignWebhookPayload,
  verifyHelloSignWebhookSignature,
} from '../lib/payroll/hellosign-webhook'

function signedPayload(secret: string, eventTime = '1710000000', eventType = 'signature_request_signed') {
  const eventHash = crypto
    .createHmac('sha256', secret)
    .update(`${eventTime}${eventType}`)
    .digest('hex')

  return {
    event: {
      event_time: eventTime,
      event_type: eventType,
      event_hash: eventHash,
    },
    signature_request: {
      signature_request_id: 'sig-123',
    },
  }
}

test('HelloSign webhook verification rejects unsigned payloads when a secret is configured', () => {
  const raw = JSON.stringify({
    event: {
      event_time: '1710000000',
      event_type: 'signature_request_signed',
    },
  })

  assert.equal(verifyHelloSignWebhookSignature(raw, 'webhook-secret'), false)
})

test('HelloSign webhook verification accepts valid JSON signatures', () => {
  const payload = signedPayload('webhook-secret')

  assert.equal(verifyHelloSignWebhookSignature(JSON.stringify(payload), 'webhook-secret'), true)
})

test('HelloSign webhook verification accepts valid form-encoded signatures', () => {
  const payload = signedPayload('webhook-secret')
  const raw = new URLSearchParams({ json: JSON.stringify(payload) }).toString()

  assert.deepEqual(parseHelloSignWebhookPayload(raw), payload)
  assert.equal(verifyHelloSignWebhookSignature(raw, 'webhook-secret'), true)
})

test('HelloSign webhook verification rejects mismatched hashes', () => {
  const payload = signedPayload('webhook-secret')
  payload.event.event_hash = 'bad-hash'

  assert.equal(verifyHelloSignWebhookSignature(JSON.stringify(payload), 'webhook-secret'), false)
})

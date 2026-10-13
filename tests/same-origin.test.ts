import test from 'node:test'
import assert from 'node:assert/strict'
import { assertSameOrigin, SameOriginError } from '../lib/security/same-origin'

const url = 'https://compass.example.com/api/kpi/goals'
function headers(values: Record<string, string>): Headers {
  const result = new Headers()
  for (const [key, value] of Object.entries(values)) result.set(key, value)
  return result
}

test('allows a same-origin browser request', () => {
  assert.doesNotThrow(() =>
    assertSameOrigin(headers({ origin: 'https://compass.example.com', host: 'compass.example.com', 'sec-fetch-site': 'same-origin' }), url),
  )
})

test('allows requests without an Origin header', () => {
  assert.doesNotThrow(() => assertSameOrigin(headers({ host: 'compass.example.com' }), url))
})

test('rejects cross-site fetch metadata', () => {
  assert.throws(() => assertSameOrigin(headers({ 'sec-fetch-site': 'cross-site', host: 'compass.example.com' }), url), SameOriginError)
})

test('rejects a foreign origin', () => {
  assert.throws(() => assertSameOrigin(headers({ origin: 'https://evil.example', host: 'compass.example.com' }), url), SameOriginError)
})

test('rejects malformed and non-http origins', () => {
  assert.throws(() => assertSameOrigin(headers({ origin: 'not a url', host: 'compass.example.com' }), url), SameOriginError)
  assert.throws(() => assertSameOrigin(headers({ origin: 'ftp://compass.example.com', host: 'compass.example.com' }), url), SameOriginError)
})

test('falls back to the request URL host when Host is absent', () => {
  assert.doesNotThrow(() => assertSameOrigin(headers({ origin: 'https://compass.example.com' }), url))
})

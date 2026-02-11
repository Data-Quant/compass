import test from 'node:test'
import assert from 'node:assert/strict'
import { checkRateLimit, normalizeClientIp } from '../lib/rate-limit'

test('normalizeClientIp extracts first forwarded IP', () => {
  const ip = normalizeClientIp('203.0.113.10, 70.41.3.18, 150.172.238.178')
  assert.equal(ip, '203.0.113.10')
})

test('normalizeClientIp strips IPv4 port suffix', () => {
  const ip = normalizeClientIp('198.51.100.5:443')
  assert.equal(ip, '198.51.100.5')
})

test('checkRateLimit blocks after max attempts per key', () => {
  const key = `tests:${Date.now()}:${Math.random()}`
  const first = checkRateLimit(key, 2)
  const second = checkRateLimit(key, 2)
  const third = checkRateLimit(key, 2)

  assert.equal(first.allowed, true)
  assert.equal(second.allowed, true)
  assert.equal(third.allowed, false)
})

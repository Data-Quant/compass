import test from 'node:test'
import assert from 'node:assert/strict'
import { isCronAuthorized } from '../lib/cron-auth'

test('accepts the exact bearer secret', () => {
  assert.equal(isCronAuthorized('Bearer s3cret-value', 's3cret-value'), true)
})

test('rejects wrong, missing, unprefixed or differently sized secrets', () => {
  assert.equal(isCronAuthorized('Bearer s3cret-valuX', 's3cret-value'), false)
  assert.equal(isCronAuthorized('Bearer short', 's3cret-value'), false)
  assert.equal(isCronAuthorized(null, 's3cret-value'), false)
  assert.equal(isCronAuthorized('s3cret-value', 's3cret-value'), false)
})

test('rejects everything when no secret is configured', () => {
  assert.equal(isCronAuthorized('Bearer anything', undefined), false)
  assert.equal(isCronAuthorized('Bearer ', ''), false)
})

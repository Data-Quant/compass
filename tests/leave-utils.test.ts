import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateLeaveDays, isValidLeaveDateRange } from '../lib/leave-utils'

test('calculateLeaveDays includes both start and end days', () => {
  const start = new Date('2026-02-01T00:00:00.000Z')
  const end = new Date('2026-02-03T00:00:00.000Z')
  assert.equal(calculateLeaveDays(start, end), 3)
})

test('isValidLeaveDateRange returns false for inverted ranges', () => {
  const start = new Date('2026-02-10T00:00:00.000Z')
  const end = new Date('2026-02-09T00:00:00.000Z')
  assert.equal(isValidLeaveDateRange(start, end), false)
})

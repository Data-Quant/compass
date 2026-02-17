import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateLeaveDays, isValidLeaveDateRange } from '../lib/leave-utils'

test('calculateLeaveDays includes both start and end weekdays', () => {
  const start = new Date('2026-02-02T00:00:00.000Z') // Monday
  const end = new Date('2026-02-04T00:00:00.000Z') // Wednesday
  assert.equal(calculateLeaveDays(start, end), 3)
})

test('calculateLeaveDays excludes Saturday and Sunday', () => {
  const start = new Date('2026-02-06T00:00:00.000Z') // Friday
  const end = new Date('2026-02-09T00:00:00.000Z') // Monday
  assert.equal(calculateLeaveDays(start, end), 2)
})

test('calculateLeaveDays returns 0 for weekend-only range', () => {
  const start = new Date('2026-02-07T00:00:00.000Z') // Saturday
  const end = new Date('2026-02-08T00:00:00.000Z') // Sunday
  assert.equal(calculateLeaveDays(start, end), 0)
})

test('isValidLeaveDateRange returns false for inverted ranges', () => {
  const start = new Date('2026-02-10T00:00:00.000Z')
  const end = new Date('2026-02-09T00:00:00.000Z')
  assert.equal(isValidLeaveDateRange(start, end), false)
})

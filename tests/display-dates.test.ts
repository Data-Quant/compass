import test from 'node:test'
import assert from 'node:assert/strict'
import { formatCalendarDate, formatTimestampDate } from '../lib/payroll/display-dates'

test('formatCalendarDate is unambiguous: day, short month, year', () => {
  assert.equal(formatCalendarDate('2026-10-01T00:00:00.000Z'), '1 Oct 2026')
  assert.equal(formatCalendarDate('2026-01-10T00:00:00.000Z'), '10 Jan 2026')
})

test('formatCalendarDate reads the stored calendar day in UTC so it never shifts', () => {
  // Midnight UTC would be the previous evening in any timezone west of UTC.
  assert.equal(formatCalendarDate('2026-10-01T00:00:00.000Z'), '1 Oct 2026')
  assert.equal(formatCalendarDate('2026-12-31T23:59:59.000Z'), '31 Dec 2026')
})

test('formatCalendarDate tolerates missing or invalid input', () => {
  assert.equal(formatCalendarDate(null), '')
  assert.equal(formatCalendarDate(''), '')
  assert.equal(formatCalendarDate('not a date'), '')
})

test('formatTimestampDate uses the same unambiguous shape', () => {
  assert.match(formatTimestampDate('2026-10-05T09:00:00.000Z'), /^\d{1,2} Oct 2026$/)
  assert.equal(formatTimestampDate(null), '')
})

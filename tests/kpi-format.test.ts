import test from 'node:test'
import assert from 'node:assert/strict'
import {
  currentMonthKey, currentQuarterKey, formatKarachiDate, formatPercent, karachiDateInputValue, monthLabel, quarterLabel, shiftMonth, shiftQuarter,
} from '../lib/kpi/format'

test('dates display in Karachi time', () => {
  assert.equal(formatKarachiDate('2026-10-14T18:59:59.999Z'), 'Wed 14 Oct')
  assert.equal(karachiDateInputValue('2026-10-14T18:59:59.999Z'), '2026-10-14')
})

test('percent formatting distinguishes no result from zero', () => {
  assert.equal(formatPercent(84.6153), '84.6%')
  assert.equal(formatPercent(0), '0.0%')
  assert.equal(formatPercent(null), 'No KPI result')
})

test('month and quarter navigation wraps years', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01')
  assert.equal(shiftMonth('2026-01', -1), '2025-12')
  assert.equal(shiftQuarter('2026-Q4', 1), '2027-Q1')
  assert.equal(shiftQuarter('2026-Q1', -1), '2025-Q4')
  assert.equal(monthLabel('2026-10'), 'October 2026')
  assert.equal(quarterLabel('2026-Q4'), 'Q4 2026')
})

test('current month and quarter use Karachi time', () => {
  assert.equal(currentMonthKey(new Date('2026-09-30T19:30:00Z')), '2026-10')
  assert.equal(currentQuarterKey(new Date('2026-09-30T19:30:00Z')), '2026-Q4')
})

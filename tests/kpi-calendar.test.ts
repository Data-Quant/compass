import test from 'node:test'
import assert from 'node:assert/strict'
import {
  defaultDeadlines,
  endOfKarachiDay,
  formatCalendarDate,
  formatMonthKey,
  formatQuarterKey,
  karachiCalendarDate,
  monthKeyOf,
  nthWorkingDayAfter,
  nthWorkingDayOfMonth,
  parseCalendarDate,
  parseMonthKey,
  parseQuarterKey,
  quarterMonths,
  quarterOf,
  validateDeadlineOrder,
} from '../lib/kpi/calendar'

const day = (instant: Date) => formatCalendarDate(karachiCalendarDate(instant))

test('a Karachi day ends at 18:59:59.999 UTC', () => {
  assert.equal(endOfKarachiDay({ year: 2026, month: 10, day: 14 }).toISOString(), '2026-10-14T18:59:59.999Z')
})

test('working days skip weekends and roll across years', () => {
  assert.deepEqual(nthWorkingDayOfMonth({ year: 2026, month: 10 }, 5), { year: 2026, month: 10, day: 7 })
  assert.deepEqual(nthWorkingDayAfter({ year: 2026, month: 10, day: 31 }, 3), { year: 2026, month: 11, day: 4 })
  assert.deepEqual(nthWorkingDayAfter({ year: 2026, month: 12, day: 31 }, 1), { year: 2027, month: 1, day: 1 })
})

test('Q4 2026 default deadlines match the spec table', () => {
  const expected: Array<[number, string[]]> = [
    [10, ['2026-10-07', '2026-11-04', '2026-11-11', '2026-11-13', '2026-11-17']],
    [11, ['2026-11-06', '2026-12-03', '2026-12-10', '2026-12-14', '2026-12-16']],
    [12, ['2026-12-07', '2027-01-05', '2027-01-12', '2027-01-14', '2027-01-18']],
  ]
  for (const [month, dates] of expected) {
    const d = defaultDeadlines({ year: 2026, month })
    assert.deepEqual([d.goalsLockAt, d.claimsDueAt, d.verifyDueAt, d.responseDueAt, d.targetFinalAt].map(day), dates, `month ${month}`)
  }
})

test('deadline order is validated', () => {
  const d = defaultDeadlines({ year: 2026, month: 10 })
  assert.equal(validateDeadlineOrder(d), null)
  assert.equal(validateDeadlineOrder({ ...d, targetFinalAt: d.responseDueAt }), null)
  assert.match(validateDeadlineOrder({ ...d, goalsLockAt: d.claimsDueAt }) ?? '', /lock must come before the claims/)
  assert.match(validateDeadlineOrder({ ...d, verifyDueAt: d.claimsDueAt }) ?? '', /claims deadline must come before/)
  assert.match(validateDeadlineOrder({ ...d, responseDueAt: d.verifyDueAt }) ?? '', /verification deadline must come before/)
  assert.match(validateDeadlineOrder({ ...d, targetFinalAt: d.verifyDueAt }) ?? '', /response deadline must not be after/)
})

test('month keys follow Karachi time', () => {
  assert.deepEqual(monthKeyOf(new Date('2026-10-31T18:59:00Z')), { year: 2026, month: 10 })
  assert.deepEqual(monthKeyOf(new Date('2026-10-31T19:30:00Z')), { year: 2026, month: 11 })
})

test('month and quarter keys parse and format', () => {
  assert.deepEqual(parseMonthKey('2026-10'), { year: 2026, month: 10 })
  assert.equal(parseMonthKey('2026-13'), null)
  assert.equal(parseMonthKey('26-10'), null)
  assert.equal(formatMonthKey({ year: 2026, month: 1 }), '2026-01')
  assert.deepEqual(parseQuarterKey('2026-Q4'), { year: 2026, quarter: 4 })
  assert.equal(parseQuarterKey('2026-Q5'), null)
  assert.equal(formatQuarterKey({ year: 2027, quarter: 1 }), '2027-Q1')
  assert.deepEqual(quarterOf({ year: 2026, month: 11 }), { year: 2026, quarter: 4 })
  assert.deepEqual(quarterMonths({ year: 2026, quarter: 4 }), [
    { year: 2026, month: 10 },
    { year: 2026, month: 11 },
    { year: 2026, month: 12 },
  ])
})

test('calendar dates are validated', () => {
  assert.deepEqual(parseCalendarDate('2026-02-28'), { year: 2026, month: 2, day: 28 })
  assert.equal(parseCalendarDate('2026-02-30'), null)
  assert.equal(parseCalendarDate('14/10/2026'), null)
})

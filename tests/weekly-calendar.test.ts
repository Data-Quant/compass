import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cycleWeeks, defaultQuestionWeeks, effectiveWeek, isCatchUpWeek, karachiWeekday, parseWeekOneMonday, questionWeekCount, totalWeeks, weekIndexAt, weekStartsAt,
} from '../lib/weekly/calendar'

const weekOne = new Date('2026-10-04T19:00:00.000Z') // Monday 5 Oct 2026, 00:00 Karachi
const quarterEnd = new Date('2026-12-31T00:00:00.000Z')

test('week one must be a Monday, stored as midnight Karachi time', () => {
  assert.equal(parseWeekOneMonday('2026-10-05')?.toISOString(), '2026-10-04T19:00:00.000Z')
  assert.equal(parseWeekOneMonday('2026-10-06'), null)
  assert.equal(parseWeekOneMonday('2026-13-01'), null)
  assert.equal(karachiWeekday(weekOne), 1)
  assert.equal(karachiWeekday(new Date('2026-10-04T18:59:59.000Z')), 0)
})

test('weeks run Monday 00:00 to Sunday 23:59 Karachi time', () => {
  assert.equal(weekIndexAt(weekOne, new Date('2026-10-04T18:59:59.999Z')), 0)
  assert.equal(weekIndexAt(weekOne, weekOne), 1)
  assert.equal(weekIndexAt(weekOne, new Date('2026-10-11T18:59:59.999Z')), 1)
  assert.equal(weekIndexAt(weekOne, new Date('2026-10-11T19:00:00.000Z')), 2)
  assert.equal(weekStartsAt(weekOne, 3).toISOString(), '2026-10-18T19:00:00.000Z')
})

test('a quarter from 5 October has 13 weeks: 11 question weeks and 2 catch-up weeks', () => {
  assert.equal(totalWeeks(weekOne, quarterEnd), 13)
  assert.equal(questionWeekCount(13), 11)
  assert.equal(isCatchUpWeek(11, 13), false)
  assert.equal(isCatchUpWeek(12, 13), true)
  assert.equal(isCatchUpWeek(14, 13), false)
  const lateStart = parseWeekOneMonday('2026-10-12')
  assert.ok(lateStart)
  assert.equal(totalWeeks(lateStart, quarterEnd), 12)
})

test('the effective week is the calendar week unless the test tools moved ahead', () => {
  const inWeekTwo = new Date('2026-10-13T08:00:00.000Z')
  assert.equal(effectiveWeek(weekOne, null, inWeekTwo), 2)
  assert.equal(effectiveWeek(weekOne, 5, inWeekTwo), 5)
  assert.equal(effectiveWeek(weekOne, 1, inWeekTwo), 2)
})



test('HR sets the question weeks; the cycle runs them plus the two catch-up weeks', () => {
  assert.equal(cycleWeeks({ questionWeeks: 12 }), 14)
  assert.equal(cycleWeeks({ questionWeeks: 1 }), 3)
  assert.equal(defaultQuestionWeeks(weekOne, quarterEnd), 11)
})

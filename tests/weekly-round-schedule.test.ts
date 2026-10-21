import test from 'node:test'
import assert from 'node:assert/strict'
import { formatCalendarDate, karachiCalendarDate, parseWeekOneStart } from '../lib/weekly/calendar'
import { roundSchedule } from '../lib/weekly/round-schedule'

const day = (instant: Date) => formatCalendarDate(karachiCalendarDate(instant))

test('the schedule gives the exact dates: each question week, the two closing weeks, and the day the round concludes', () => {
  // Week 1 on Wednesday 21 October 2026, 8 question weeks.
  const schedule = roundSchedule(parseWeekOneStart('2026-10-21')!, 8)
  assert.deepEqual([day(schedule.weekOne.startsOn), day(schedule.weekOne.dueOn)], ['2026-10-21', '2026-10-23'])
  assert.deepEqual([day(schedule.lastQuestionWeek.startsOn), day(schedule.lastQuestionWeek.dueOn)], ['2026-12-07', '2026-12-11'])
  assert.equal(schedule.questionWeeks, 8)
  assert.deepEqual([day(schedule.closingWeeks.startsOn), day(schedule.closingWeeks.endsOn)], ['2026-12-14', '2026-12-27'])
  assert.equal(day(schedule.concludesOn), '2026-12-27')
})

test('with a single question week the closing weeks follow straight after it', () => {
  const schedule = roundSchedule(parseWeekOneStart('2027-01-04')!, 1)
  assert.deepEqual([day(schedule.lastQuestionWeek.startsOn), day(schedule.lastQuestionWeek.dueOn)], ['2027-01-04', '2027-01-08'])
  assert.deepEqual([day(schedule.closingWeeks.startsOn), day(schedule.concludesOn)], ['2027-01-11', '2027-01-24'])
})

import test from 'node:test'
import assert from 'node:assert/strict'
import type { TeamTag } from '@prisma/client'
import { ALL_TEAMS } from '../lib/handbook/teams'
import {
  holidayAppliesTo,
  isUntaggedHoliday,
  filterHolidaysForTeam,
  holidayDatesForTeam,
  teamsObserving,
  monthRangeUtc,
  groupHolidaysByTeam,
} from '../lib/holidays'

const eid = { holidayDate: new Date('2026-05-27'), teamTags: ['PAKISTAN', 'THREE_E_PAKISTAN'] as TeamTag[] }
const throneDay = { holidayDate: new Date('2026-07-30'), teamTags: ['MOROCCO', 'THREE_E_MOROCCO'] as TeamTag[] }
const legacy = { holidayDate: new Date('2026-01-01'), teamTags: [] as TeamTag[] }

test('a national holiday reaches both entities in that country', () => {
  // 43 people sit in Pakistan across two tags; a public holiday there applies to
  // all of them regardless of which entity employs them.
  assert.equal(holidayAppliesTo(eid, 'PAKISTAN'), true)
  assert.equal(holidayAppliesTo(eid, 'THREE_E_PAKISTAN'), true)
})

test('a holiday does not leak to other countries', () => {
  for (const team of ['MOROCCO', 'THREE_E_MOROCCO', 'COLOMBIA', 'INDONESIA', 'NOBLE'] as TeamTag[]) {
    assert.equal(holidayAppliesTo(eid, team), false, `Eid leaked to ${team}`)
  }

  for (const team of ['PAKISTAN', 'THREE_E_PAKISTAN'] as TeamTag[]) {
    assert.equal(holidayAppliesTo(throneDay, team), false, `Throne Day leaked to ${team}`)
  }
})

test('untagged users receive no holidays', () => {
  // Deliberate: working days are team-scoped, so inferring a team would be
  // inferring someone's pay. The admin UI surfaces who is untagged.
  assert.equal(holidayAppliesTo(eid, null), false)
  assert.equal(holidayAppliesTo(eid, undefined), false)
})

test('holidays created before tagging still apply to everyone', () => {
  assert.equal(isUntaggedHoliday(legacy), true)

  for (const team of ALL_TEAMS) {
    assert.equal(holidayAppliesTo(legacy, team), true, `legacy holiday missed ${team}`)
  }
})

test('an untagged holiday still reaches an untagged user', () => {
  // Both sides unknown means preserve the old company-wide behaviour rather than
  // dropping the holiday entirely.
  assert.equal(holidayAppliesTo(legacy, null), true)
})

test('filtering yields only the holidays a team observes', () => {
  const all = [eid, throneDay, legacy]

  assert.deepEqual(filterHolidaysForTeam(all, 'PAKISTAN'), [eid, legacy])
  assert.deepEqual(filterHolidaysForTeam(all, 'THREE_E_MOROCCO'), [throneDay, legacy])
  assert.deepEqual(filterHolidaysForTeam(all, 'COLOMBIA'), [legacy])
  assert.deepEqual(filterHolidaysForTeam(all, null), [legacy])
})

test('payroll gets dates only for the employee own team', () => {
  const dates = holidayDatesForTeam([eid, throneDay], 'PAKISTAN')

  assert.equal(dates.length, 1)
  assert.equal(dates[0].toISOString().slice(0, 10), '2026-05-27')
})

test('working days cannot be cut by another country holiday', () => {
  // The regression that matters: before tagging, a Moroccan holiday would have
  // reduced Pakistani working days and quietly changed 17 people's travel pay.
  const pakistanDates = holidayDatesForTeam([eid, throneDay], 'PAKISTAN')
  const moroccoDates = holidayDatesForTeam([eid, throneDay], 'MOROCCO')

  assert.equal(pakistanDates.length, 1)
  assert.equal(moroccoDates.length, 1)
  assert.notEqual(
    pakistanDates[0].getTime(),
    moroccoDates[0].getTime(),
    'each country should subtract its own holiday, not the other'
  )
})

test('notification audience is the observing teams', () => {
  assert.deepEqual(teamsObserving(eid, ALL_TEAMS), ['PAKISTAN', 'THREE_E_PAKISTAN'])
  assert.deepEqual(teamsObserving(legacy, ALL_TEAMS), [...ALL_TEAMS])
})

test('the month range covers the whole month in UTC', () => {
  const { start, end } = monthRangeUtc(new Date('2026-05-14T09:30:00Z'))

  assert.equal(start.toISOString(), '2026-05-01T00:00:00.000Z')
  assert.equal(end.toISOString(), '2026-05-31T23:59:59.999Z')
})

test('month length and leap years are handled', () => {
  assert.equal(monthRangeUtc(new Date('2026-02-10T00:00:00Z')).end.toISOString().slice(0, 10), '2026-02-28')
  assert.equal(monthRangeUtc(new Date('2028-02-10T00:00:00Z')).end.toISOString().slice(0, 10), '2028-02-29')
  assert.equal(monthRangeUtc(new Date('2026-12-31T23:00:00Z')).end.toISOString().slice(0, 10), '2026-12-31')
})

test('a holiday on the last instant of the month is still inside the range', () => {
  // The digest runs on the 1st, so an off-by-one at either edge would drop a
  // holiday from the month it belongs to.
  const { start, end } = monthRangeUtc(new Date('2026-05-14T00:00:00Z'))
  const lastMoment = new Date('2026-05-31T23:59:59.000Z')

  assert.ok(lastMoment >= start && lastMoment <= end)
})

test('the digest groups holidays by observing team', () => {
  const grouped = groupHolidaysByTeam([eid, throneDay], ALL_TEAMS)

  assert.deepEqual(grouped.get('PAKISTAN'), [eid])
  assert.deepEqual(grouped.get('THREE_E_PAKISTAN'), [eid])
  assert.deepEqual(grouped.get('MOROCCO'), [throneDay])
  assert.deepEqual(grouped.get('THREE_E_MOROCCO'), [throneDay])
})

test('teams with nothing that month get no entry, so no empty digest is sent', () => {
  const grouped = groupHolidaysByTeam([eid], ALL_TEAMS)

  assert.equal(grouped.has('COLOMBIA'), false)
  assert.equal(grouped.has('INDONESIA'), false)
  assert.equal(grouped.has('MOROCCO'), false)
})

test('an untagged holiday reaches every team exactly once', () => {
  const grouped = groupHolidaysByTeam([legacy], ALL_TEAMS)

  assert.equal(grouped.size, ALL_TEAMS.length)
  for (const team of ALL_TEAMS) {
    assert.deepEqual(grouped.get(team), [legacy], `${team} should have it once`)
  }
})

test('a team observing several holidays gets them all in one group', () => {
  const secondEid = { holidayDate: new Date('2026-05-28'), teamTags: ['PAKISTAN'] as TeamTag[] }
  const grouped = groupHolidaysByTeam([eid, secondEid], ALL_TEAMS)

  assert.equal(grouped.get('PAKISTAN')?.length, 2)
  assert.equal(grouped.get('THREE_E_PAKISTAN')?.length, 1)
})

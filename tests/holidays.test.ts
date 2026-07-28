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

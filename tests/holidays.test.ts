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
  holidayIdsFullyDelivered,
  expandHolidayTeamTags,
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

test('a holiday is marked announced only when no observing team failed', () => {
  const holidays = [
    { id: 'eid', teamTags: ['PAKISTAN', 'THREE_E_PAKISTAN'] as TeamTag[] },
    { id: 'throne', teamTags: ['MOROCCO'] as TeamTag[] },
  ]

  // Nothing failed: both are done.
  assert.deepEqual(
    holidayIdsFullyDelivered(holidays, new Set<TeamTag>(), ALL_TEAMS),
    ['eid', 'throne'],
  )

  // Eid reaches two teams. If only one of them failed, Eid is NOT done -- marking it
  // announced would leave the other entity permanently untold.
  assert.deepEqual(
    holidayIdsFullyDelivered(holidays, new Set<TeamTag>(['THREE_E_PAKISTAN']), ALL_TEAMS),
    ['throne'],
  )

  // A failure on an unrelated team does not hold anything back.
  assert.deepEqual(
    holidayIdsFullyDelivered(holidays, new Set<TeamTag>(['COLOMBIA']), ALL_TEAMS),
    ['eid', 'throne'],
  )
})

test('an untagged holiday needs every team to succeed', () => {
  // Empty tags mean company-wide, so any team failing leaves someone untold.
  const companyWide = [{ id: 'newyear', teamTags: [] as TeamTag[] }]

  assert.deepEqual(holidayIdsFullyDelivered(companyWide, new Set<TeamTag>(), ALL_TEAMS), ['newyear'])
  assert.deepEqual(
    holidayIdsFullyDelivered(companyWide, new Set<TeamTag>(['NOBLE']), ALL_TEAMS),
    [],
  )
})

// --- Pakistani holidays reach both Pakistan entities ---
//
// PAKISTAN and THREE_E_PAKISTAN are the same country split by employing entity, and
// a Pakistani national holiday applies to everyone there. Hand-tagging drifted: 14
// Aug 2026 Independence Day was tagged PAKISTAN alone, so 3E Pakistan was shown a
// full 21-day month and expected to work a national holiday.
//
// Morocco is deliberately not paired. 3E Morocco observes US public holidays, not
// Moroccan ones, so widening a Moroccan holiday to them would wrongly shorten their
// month and inflate their travel allowance.

test('tagging Pakistan includes 3E Pakistan', () => {
  assert.deepEqual(expandHolidayTeamTags(['PAKISTAN']), ['PAKISTAN', 'THREE_E_PAKISTAN'])
})

test('the Pakistan pairing is symmetric, since it is one country either way', () => {
  assert.deepEqual(expandHolidayTeamTags(['THREE_E_PAKISTAN']), ['PAKISTAN', 'THREE_E_PAKISTAN'])
})

test('a Moroccan holiday does NOT reach 3E Morocco', () => {
  // 3E Morocco follows the US calendar. Pairing them by geography would take three
  // Moroccan national holidays off 24 people who actually work them.
  assert.deepEqual(expandHolidayTeamTags(['MOROCCO']), ['MOROCCO'])
  assert.deepEqual(expandHolidayTeamTags(['THREE_E_MOROCCO']), ['THREE_E_MOROCCO'])
})

test('teams with no pairing are left alone', () => {
  assert.deepEqual(expandHolidayTeamTags(['COLOMBIA']), ['COLOMBIA'])
  assert.deepEqual(expandHolidayTeamTags(['INDONESIA']), ['INDONESIA'])
  assert.deepEqual(expandHolidayTeamTags(['NOBLE']), ['NOBLE'])
})

test('expansion dedupes and returns display order', () => {
  assert.deepEqual(
    expandHolidayTeamTags(['THREE_E_PAKISTAN', 'PAKISTAN', 'PAKISTAN']),
    ['PAKISTAN', 'THREE_E_PAKISTAN'],
  )
  // ALL_TEAMS order, not the order they were passed in.
  assert.deepEqual(expandHolidayTeamTags(['THREE_E_MOROCCO', 'COLOMBIA']), [
    'COLOMBIA',
    'THREE_E_MOROCCO',
  ])
})

test('an empty tag list stays empty and keeps meaning company-wide', () => {
  // Expanding [] to every team would look identical but lose the distinction the
  // API relies on to reject a mis-saved empty selection.
  assert.deepEqual(expandHolidayTeamTags([]), [])
})

test('a fully tagged holiday is unchanged', () => {
  assert.deepEqual(expandHolidayTeamTags([...ALL_TEAMS]), [...ALL_TEAMS])
})

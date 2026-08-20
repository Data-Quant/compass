import test from 'node:test'
import assert from 'node:assert/strict'
import type { TeamTag } from '@prisma/client'
import {
  companyWideHolidayDates,
  workingDaysByTeam,
} from '../lib/payroll/attendance-calendar'

/**
 * August 2026, the period that exposed the bug. 21 weekdays, and eight holidays
 * spread across four countries -- only one of which (14 Aug) is Pakistani.
 */
const periodStart = new Date('2026-08-01T00:00:00.000Z')
const periodEnd = new Date('2026-08-31T00:00:00.000Z')

const h = (iso: string, name: string, teamTags: TeamTag[]) => ({
  holidayDate: new Date(`${iso}T00:00:00.000Z`),
  name,
  teamTags,
})

const august = [
  h('2026-08-07', 'Battle of Boyaca Day', ['COLOMBIA']),
  h('2026-08-14', 'Oued Ed Dahab Day', ['MOROCCO']),
  h('2026-08-14', 'Independence Day', ['PAKISTAN']),
  h('2026-08-17', 'Independence Day', ['INDONESIA']),
  h('2026-08-17', 'Assumption of Mary', ['COLOMBIA']),
  h('2026-08-20', 'Revolution Day', ['MOROCCO']),
  h('2026-08-21', 'Birth of King Mohammad VI', ['MOROCCO']),
  h('2026-08-25', 'Mawlid', ['INDONESIA']),
]

test('working days are counted per team, not company-wide', () => {
  const byTeam = workingDaysByTeam({
    periodStart,
    periodEnd,
    holidays: august,
    teams: ['PAKISTAN', 'MOROCCO', 'COLOMBIA', 'INDONESIA', 'THREE_E_PAKISTAN'],
  })

  // The whole bug in one assertion: Pakistan loses only its own 14 August, not
  // all eight holidays. Subtracting every holiday gave 15 and cut travel
  // allowance for people who worked those days.
  assert.equal(byTeam.PAKISTAN, 20)
  assert.notEqual(byTeam.PAKISTAN, 15)

  assert.equal(byTeam.MOROCCO, 18)
  assert.equal(byTeam.COLOMBIA, 19)
  assert.equal(byTeam.INDONESIA, 19)
  // Nothing tagged for 3E Pakistan in this period, so its month is untouched.
  assert.equal(byTeam.THREE_E_PAKISTAN, 21)
})

test('two holidays on one date only cost the team that observes one', () => {
  // 14 August is a holiday in both Pakistan and Morocco, as separate rows.
  const byTeam = workingDaysByTeam({
    periodStart,
    periodEnd,
    holidays: [
      h('2026-08-14', 'Oued Ed Dahab Day', ['MOROCCO']),
      h('2026-08-14', 'Independence Day', ['PAKISTAN']),
    ],
    teams: ['PAKISTAN', 'MOROCCO', 'COLOMBIA'],
  })
  assert.equal(byTeam.PAKISTAN, 20)
  assert.equal(byTeam.MOROCCO, 20)
  assert.equal(byTeam.COLOMBIA, 21)
})

test('an untagged holiday still costs every team a day', () => {
  // Empty teamTags predates tagging and means company-wide -- see lib/holidays.ts.
  const byTeam = workingDaysByTeam({
    periodStart,
    periodEnd,
    holidays: [h('2026-08-14', 'Company Day', [])],
    teams: ['PAKISTAN', 'MOROCCO'],
  })
  assert.equal(byTeam.PAKISTAN, 20)
  assert.equal(byTeam.MOROCCO, 20)
})

test('only company-wide holidays are dropped from the shared grid columns', () => {
  // The attendance grid is one set of columns for everyone, so a day may only be
  // removed outright when nobody works it. Team holidays stay as columns and are
  // disabled per employee instead -- otherwise Pakistani staff have no column on
  // which to be marked present for a Moroccan holiday they worked through.
  const dates = companyWideHolidayDates([
    ...august,
    h('2026-08-28', 'Company Day', []),
  ])
  assert.deepEqual(
    dates.map((d) => d.toISOString().slice(0, 10)),
    ['2026-08-28'],
  )
})

test('no holidays at all leaves every weekday available', () => {
  assert.deepEqual(companyWideHolidayDates([]), [])
  const byTeam = workingDaysByTeam({
    periodStart,
    periodEnd,
    holidays: [],
    teams: ['PAKISTAN'],
  })
  assert.equal(byTeam.PAKISTAN, 21)
})

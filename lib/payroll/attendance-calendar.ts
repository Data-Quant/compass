import type { TeamTag } from '@prisma/client'
import { isUntaggedHoliday, holidayDatesForTeam, type HolidayLike } from '@/lib/holidays'
import { calculateWorkingDays } from '@/lib/payroll/settings'

/**
 * The attendance calendar, scoped by team.
 *
 * Public holidays are national: lib/payroll/engine.ts already resolves them per team
 * when computing working days and prorating travel allowance. The attendance layer
 * did not, and subtracted every holiday from a single company-wide figure. In August
 * 2026 that turned Pakistan's 20 working days into 15, and -- because the grid built
 * its day columns the same way -- removed the columns on which Pakistani staff would
 * have been marked present for Moroccan, Colombian and Indonesian holidays they
 * worked through. Travel allowance is present days over working days, so the missing
 * marks cut their allowance.
 *
 * This module gives the attendance layer the same team-scoped view the engine uses.
 */

/**
 * Holidays that genuinely apply to everyone, and so may be dropped from the shared
 * grid outright.
 *
 * An empty tag list predates tagging and means company-wide (see lib/holidays.ts).
 * Anything tagged belongs to specific teams and has to stay as a column, disabled per
 * employee, or the people who worked it have nowhere to be marked present.
 */
export function companyWideHolidayDates<T extends Pick<HolidayLike, 'teamTags'> & { holidayDate: Date }>(
  holidays: readonly T[]
): Date[] {
  return holidays.filter(isUntaggedHoliday).map((holiday) => holiday.holidayDate)
}

/**
 * Working days for each team, the denominator behind travel allowance.
 *
 * Computed per team rather than once, because a Moroccan holiday must not shorten
 * the Pakistani month. Duplicate dates are harmless: calculateWorkingDays matches on
 * date membership, so two holidays sharing a day cost that team one day, not two.
 */
export function workingDaysByTeam(params: {
  periodStart: Date
  periodEnd: Date
  holidays: readonly HolidayLike[]
  teams: readonly TeamTag[]
  weekendDays?: number[]
}): Record<string, number> {
  const out: Record<string, number> = {}
  for (const team of params.teams) {
    out[team] = calculateWorkingDays({
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      holidays: holidayDatesForTeam(params.holidays, team),
      weekendDays: params.weekendDays,
    })
  }
  return out
}

import type { TeamTag } from '@prisma/client'

/**
 * Which public holidays apply to whom.
 *
 * Holidays are national: Eid is a Pakistani holiday, and applying it to the
 * Morocco or Colombia teams is simply wrong. Each holiday therefore carries the
 * set of teams that observe it.
 *
 * This matters beyond display. lib/payroll/engine.ts divides travel allowance by
 * the number of working days in the period, and working days are calendar days
 * minus holidays. A holiday applied to the wrong team silently changes that
 * person's pay, so the same resolution rule has to drive both the calendar and
 * the payroll engine -- hence one module rather than a filter at each call site.
 */

export type HolidayLike = {
  holidayDate: Date
  teamTags: TeamTag[]
}

/**
 * An empty tag list means the holiday predates tagging, so it still applies to
 * everyone. Tagging a holiday with no teams at all is prevented at the API layer;
 * without that, saving an empty selection would silently turn a holiday company-wide.
 */
export function isUntaggedHoliday(holiday: Pick<HolidayLike, 'teamTags'>): boolean {
  return !holiday.teamTags || holiday.teamTags.length === 0
}

/**
 * Whether a holiday applies to someone on a given team.
 *
 * A user with no team tag gets nothing: with team-scoped working days, guessing
 * would mean guessing at their pay. Untagged people are surfaced in the admin UI
 * so this stays a visible gap rather than a silent one.
 */
export function holidayAppliesTo(
  holiday: Pick<HolidayLike, 'teamTags'>,
  teamTag: TeamTag | null | undefined
): boolean {
  if (isUntaggedHoliday(holiday)) {
    return true
  }

  if (!teamTag) {
    return false
  }

  return holiday.teamTags.includes(teamTag)
}

export function filterHolidaysForTeam<T extends Pick<HolidayLike, 'teamTags'>>(
  holidays: readonly T[],
  teamTag: TeamTag | null | undefined
): T[] {
  return holidays.filter((holiday) => holidayAppliesTo(holiday, teamTag))
}

/** The dates the payroll engine subtracts when counting working days. */
export function holidayDatesForTeam(
  holidays: readonly HolidayLike[],
  teamTag: TeamTag | null | undefined
): Date[] {
  return filterHolidaysForTeam(holidays, teamTag).map((holiday) => holiday.holidayDate)
}

/** Everyone who should be notified about a holiday, by team tag. */
export function teamsObserving(
  holiday: Pick<HolidayLike, 'teamTags'>,
  allTeams: readonly TeamTag[]
): TeamTag[] {
  return isUntaggedHoliday(holiday) ? [...allTeams] : [...holiday.teamTags]
}

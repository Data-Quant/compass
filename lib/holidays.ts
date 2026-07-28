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

/**
 * Bounds of the month containing `reference`, in UTC.
 *
 * UTC throughout, to match how holiday dates are stored and so the monthly digest
 * covers the same month regardless of where the cron happens to run.
 */
export function monthRangeUtc(reference: Date): { start: Date; end: Date } {
  const year = reference.getUTCFullYear()
  const month = reference.getUTCMonth()

  return {
    start: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
    // Day 0 of the next month is the last day of this one, which sidesteps
    // month-length and leap-year handling.
    end: new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)),
  }
}

/**
 * Holidays grouped by the team that observes them, for the monthly digest.
 *
 * Teams with nothing that month are left out entirely rather than mapped to an
 * empty list, so callers cannot accidentally send "no holidays this month" mail.
 * A user carries a single team tag, so nobody appears in two groups and nobody
 * receives the digest twice.
 */
export function groupHolidaysByTeam<T extends Pick<HolidayLike, 'teamTags'>>(
  holidays: readonly T[],
  allTeams: readonly TeamTag[]
): Map<TeamTag, T[]> {
  const grouped = new Map<TeamTag, T[]>()

  for (const holiday of holidays) {
    for (const team of teamsObserving(holiday, allTeams)) {
      const existing = grouped.get(team)
      if (existing) {
        existing.push(holiday)
      } else {
        grouped.set(team, [holiday])
      }
    }
  }

  return grouped
}

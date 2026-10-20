/**
 * Date display for payroll settings.
 *
 * `toLocaleDateString()` with no locale follows the viewer's browser region,
 * so the same stored date renders as 10/01/2026 for one person and 01/10/2026
 * for another -- and 1 October reads as 10 January. These helpers always spell
 * the month ("1 Oct 2026"), which no one can misread.
 */

const CALENDAR_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const LOCAL_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * A date-only value (effective dates, holidays, financial years). These are
 * saved as midnight UTC, so they are read in UTC; formatting in the viewer's
 * timezone would show the previous day anywhere west of UTC.
 */
export function formatCalendarDate(value: string | Date | null | undefined): string {
  const date = toDate(value)
  return date ? CALENDAR_DATE.format(date) : ''
}

/** A moment in time (e.g. when something was sent), shown in the viewer's timezone. */
export function formatTimestampDate(value: string | Date | null | undefined): string {
  const date = toDate(value)
  return date ? LOCAL_DATE.format(date) : ''
}

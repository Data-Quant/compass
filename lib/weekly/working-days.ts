import { endOfKarachiDay, isWorkingDay, karachiCalendarDate, sameCalendarDate, type CalendarDate } from '../kpi/calendar'

/** D14: an evaluatee may challenge within 10 working days of results being published. */
export const CHALLENGE_WORKING_DAYS = 10

function nextDay(date: CalendarDate): CalendarDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + 1))
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() }
}

/** The end (23:59:59.999 Karachi) of the `days`-th working day after `start`'s Karachi date. Weekends and `holidays` do not count. */
export function addWorkingDays(start: Date, days: number, holidays: readonly CalendarDate[]): Date {
  let date = karachiCalendarDate(start)
  let counted = 0
  while (counted < days) {
    date = nextDay(date)
    if (isWorkingDay(date) && !holidays.some((holiday) => sameCalendarDate(holiday, date))) counted += 1
  }
  return endOfKarachiDay(date)
}

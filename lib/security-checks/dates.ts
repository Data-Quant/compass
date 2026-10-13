// Date helpers. Deadlines are end-of-day Asia/Karachi (UTC+05:00, no DST),
// matching the KPI module's convention.
import {
  endOfKarachiDay,
  formatCalendarDate,
  isWorkingDay,
  karachiCalendarDate,
  parseCalendarDate,
  type CalendarDate,
} from '@/lib/kpi/calendar'

export const DAY_MS = 24 * 60 * 60 * 1000

export function startOfKarachiDay(date: CalendarDate): Date {
  return new Date(endOfKarachiDay(date).getTime() + 1 - DAY_MS)
}

/** YYYY-MM-DD of the Karachi calendar day containing `instant`. */
export function karachiDateKey(instant: Date): string {
  return formatCalendarDate(karachiCalendarDate(instant))
}

export function startOfKarachiDateKey(key: string): Date | null {
  const date = parseCalendarDate(key)
  return date ? startOfKarachiDay(date) : null
}

export function endOfKarachiDateKey(key: string): Date | null {
  const date = parseCalendarDate(key)
  return date ? endOfKarachiDay(date) : null
}

export function addDays(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * DAY_MS)
}

export function laterOf(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b
}

/** End of the Karachi calendar day that is `days` days after `instant`'s day. */
export function endOfDayAfter(instant: Date, days: number): Date {
  const day = karachiCalendarDate(instant)
  return endOfKarachiDay(shiftCalendarDate(day, days))
}

export function shiftCalendarDate(date: CalendarDate, days: number): CalendarDate {
  const value = new Date(Date.UTC(date.year, date.month - 1, date.day) + days * DAY_MS)
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() }
}

/** Adds calendar months, clamping the day (Jan 31 + 1 month → Feb 28/29). */
export function addMonths(instant: Date, months: number): Date {
  const date = new Date(instant.getTime())
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, lastDay))
  return date
}

/** Counts Karachi working days (Mon–Fri) strictly after `from`'s day up to and including `to`'s day. */
export function businessDaysBetween(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0
  let day = karachiCalendarDate(from)
  const last = karachiCalendarDate(to)
  const lastKey = Date.UTC(last.year, last.month - 1, last.day)
  let count = 0
  for (;;) {
    day = shiftCalendarDate(day, 1)
    if (Date.UTC(day.year, day.month - 1, day.day) > lastKey) return count
    if (isWorkingDay(day)) count += 1
  }
}

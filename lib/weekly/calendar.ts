// Weekly-evaluation weeks run Monday 00:00 to Sunday 23:59 in Asia/Karachi (UTC+05:00, no DST).
import { endOfKarachiDay, karachiCalendarDate, parseCalendarDate, type CalendarDate } from '../kpi/calendar'

const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
export const WEEK_MS = 7 * DAY_MS
/** The last weeks of a cycle are for catch-up and the optional comment questions. */
export const CATCH_UP_WEEKS = 2
/** D17: a joiner needs at least this many question weeks to be evaluated. */
export const LATE_JOINER_MIN_WEEKS = 6

export function startOfKarachiDay(date: CalendarDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day) - KARACHI_OFFSET_MS)
}

/** 0 = Sunday … 6 = Saturday, in Karachi. */
export function karachiWeekday(instant: Date): number {
  const date = karachiCalendarDate(instant)
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()
}

/** A YYYY-MM-DD Monday as the instant week 1 starts; null when invalid or not a Monday. */
export function parseWeekOneMonday(value: string): Date | null {
  const date = parseCalendarDate(value)
  if (!date || new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay() !== 1) return null
  return startOfKarachiDay(date)
}

/** Week number containing `instant`; 0 or less before week 1. */
export function weekIndexAt(weekOneStartsOn: Date, instant: Date): number {
  return Math.floor((instant.getTime() - weekOneStartsOn.getTime()) / WEEK_MS) + 1
}

/** Weeks from week 1 through the period's last day. */
export function totalWeeks(weekOneStartsOn: Date, periodEnd: Date): number {
  return Math.max(1, weekIndexAt(weekOneStartsOn, endOfKarachiDay(karachiCalendarDate(periodEnd))))
}

export function questionWeekCount(total: number): number {
  return Math.max(1, total - CATCH_UP_WEEKS)
}

export function isCatchUpWeek(week: number, total: number): boolean {
  return week > questionWeekCount(total) && week <= total
}

export function weekStartsAt(weekOneStartsOn: Date, week: number): Date {
  return new Date(weekOneStartsOn.getTime() + (week - 1) * WEEK_MS)
}

/** The calendar week, or a later week the preview test tools have released. */
export function effectiveWeek(weekOneStartsOn: Date, simulatedWeek: number | null, now: Date): number {
  return Math.max(weekIndexAt(weekOneStartsOn, now), simulatedWeek ?? 0)
}

/**
 * D17: a joiner is late when fewer question weeks are left than the minimum. In a cycle shorter than the
 * minimum, someone present for every question week is never late (only later joiners are).
 */
export function joinedTooLate(joiningDate: Date | null, weekOneStartsOn: Date, total: number): boolean {
  if (!joiningDate) return false
  const questionWeeks = questionWeekCount(total)
  const joinWeek = Math.max(1, weekIndexAt(weekOneStartsOn, joiningDate))
  return questionWeeks - joinWeek + 1 < Math.min(LATE_JOINER_MIN_WEEKS, questionWeeks)
}

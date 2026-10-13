// Weekly-evaluation weeks run Monday 00:00 to Sunday 23:59 in Asia/Karachi (UTC+05:00, no DST), except week 1,
// which starts on the working day HR chose. Each week's questions are due at the end of its Friday.

export interface CalendarDate { year: number; month: number; day: number }

const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

function toUtcMidnight(date: CalendarDate): number {
  return Date.UTC(date.year, date.month - 1, date.day)
}

function fromUtcMs(ms: number): CalendarDate {
  const value = new Date(ms)
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() }
}

export function isWorkingDay(date: CalendarDate): boolean {
  const weekday = new Date(toUtcMidnight(date)).getUTCDay()
  return weekday !== 0 && weekday !== 6
}

export function sameCalendarDate(a: CalendarDate, b: CalendarDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day
}

export function endOfKarachiDay(date: CalendarDate): Date {
  return new Date(toUtcMidnight(date) + DAY_MS - 1 - KARACHI_OFFSET_MS)
}

export function karachiCalendarDate(instant: Date): CalendarDate {
  return fromUtcMs(instant.getTime() + KARACHI_OFFSET_MS)
}

/** A real YYYY-MM-DD date, or null. */
export function parseCalendarDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
  return sameCalendarDate(fromUtcMs(toUtcMidnight(date)), date) ? date : null
}

export function formatCalendarDate(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}
const WEEK_MS = 7 * DAY_MS
/** The last weeks of a cycle are for catch-up and the optional comment questions. */
export const CATCH_UP_WEEKS = 2

export function startOfKarachiDay(date: CalendarDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day) - KARACHI_OFFSET_MS)
}

/** Whether two instants fall on the same Karachi calendar day. */
export function sameKarachiDay(a: Date, b: Date): boolean {
  return sameCalendarDate(karachiCalendarDate(a), karachiCalendarDate(b))
}

/** 0 = Sunday … 6 = Saturday, in Karachi. */
export function karachiWeekday(instant: Date): number {
  const date = karachiCalendarDate(instant)
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()
}

/** A YYYY-MM-DD working day (Monday to Friday) as the instant week 1 starts; null when invalid or a weekend. */
export function parseWeekOneStart(value: string): Date | null {
  const date = parseCalendarDate(value)
  return date && isWorkingDay(date) ? startOfKarachiDay(date) : null
}

/** The Monday 00:00 of week 1's calendar week; every later week starts a whole number of weeks after it. */
function weekOneMonday(weekOneStartsOn: Date): number {
  const sinceMonday = (karachiWeekday(weekOneStartsOn) + 6) % 7
  return weekOneStartsOn.getTime() - sinceMonday * DAY_MS
}

/** Week number containing `instant`; 0 or less before week 1. */
export function weekIndexAt(weekOneStartsOn: Date, instant: Date): number {
  const week = Math.floor((instant.getTime() - weekOneMonday(weekOneStartsOn)) / WEEK_MS) + 1
  return instant < weekOneStartsOn ? Math.min(week, 0) : week
}

/** HR sets the question weeks; the two catch-up weeks follow them. */
export function cycleWeeks(cycle: { questionWeeks: number }): number {
  return cycle.questionWeeks + CATCH_UP_WEEKS
}

/** The question weeks that fill the period after week 1, leaving the catch-up weeks. */
export function defaultQuestionWeeks(weekOneStartsOn: Date, periodEnd: Date): number {
  return questionWeekCount(totalWeeks(weekOneStartsOn, periodEnd))
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
  return week === 1 ? weekOneStartsOn : new Date(weekOneMonday(weekOneStartsOn) + (week - 1) * WEEK_MS)
}

/** The weekday each week's questions are due, as people read it. */
export const DUE_DAY = 'Friday'
/** Friday is 4 days after the week's Monday. */
const DUE_DAYS_AFTER_MONDAY = 4

/** The last moment to answer a week's questions: the end of its Friday. Answers stay editable until the week ends. */
export function weekDueAt(weekOneStartsOn: Date, week: number): Date {
  return new Date(weekOneMonday(weekOneStartsOn) + (week - 1) * WEEK_MS + (DUE_DAYS_AFTER_MONDAY + 1) * DAY_MS - 1)
}

/** The calendar week, or a later week the preview test tools have released. */
export function effectiveWeek(weekOneStartsOn: Date, simulatedWeek: number | null, now: Date): number {
  return Math.max(weekIndexAt(weekOneStartsOn, now), simulatedWeek ?? 0)
}


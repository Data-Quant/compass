// Calendar-day helpers. Deadlines are the end of a day in Asia/Karachi,
// which is UTC+05:00 all year (no DST).

export interface CalendarDate {
  year: number
  month: number
  day: number
}

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

export function endOfKarachiDay(date: CalendarDate): Date {
  return new Date(toUtcMidnight(date) + DAY_MS - 1 - KARACHI_OFFSET_MS)
}

export function karachiCalendarDate(instant: Date): CalendarDate {
  return fromUtcMs(instant.getTime() + KARACHI_OFFSET_MS)
}

export function parseCalendarDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
  const check = fromUtcMs(toUtcMidnight(date))
  return check.year === date.year && check.month === date.month && check.day === date.day ? date : null
}

export function formatCalendarDate(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

// Pure date logic for KPI months. Deadlines are the end of a day in
// Asia/Karachi, which is UTC+05:00 all year (no DST).

export interface MonthKey { year: number; month: number }
export interface CalendarDate { year: number; month: number; day: number }
export interface QuarterKey { year: number; quarter: 1 | 2 | 3 | 4 }
export interface KpiMonthDeadlines {
  goalsLockAt: Date
  claimsDueAt: Date
  verifyDueAt: Date
  responseDueAt: Date
  targetFinalAt: Date
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

export function lastDayOfMonth(key: MonthKey): CalendarDate {
  return fromUtcMs(Date.UTC(key.year, key.month, 0))
}

export function nthWorkingDayOfMonth(key: MonthKey, n: number): CalendarDate {
  let found = 0
  for (let day = 1; day <= lastDayOfMonth(key).day; day += 1) {
    const date = { year: key.year, month: key.month, day }
    if (isWorkingDay(date)) {
      found += 1
      if (found === n) return date
    }
  }
  throw new Error(`${formatMonthKey(key)} has fewer than ${n} working days`)
}

export function nthWorkingDayAfter(date: CalendarDate, n: number): CalendarDate {
  let ms = toUtcMidnight(date)
  let found = 0
  while (found < n) {
    ms += DAY_MS
    if (isWorkingDay(fromUtcMs(ms))) found += 1
  }
  return fromUtcMs(ms)
}

export function endOfKarachiDay(date: CalendarDate): Date {
  return new Date(toUtcMidnight(date) + DAY_MS - 1 - KARACHI_OFFSET_MS)
}

export function defaultDeadlines(key: MonthKey): KpiMonthDeadlines {
  const monthEnd = lastDayOfMonth(key)
  return {
    goalsLockAt: endOfKarachiDay(nthWorkingDayOfMonth(key, 5)),
    claimsDueAt: endOfKarachiDay(nthWorkingDayAfter(monthEnd, 3)),
    verifyDueAt: endOfKarachiDay(nthWorkingDayAfter(monthEnd, 8)),
    responseDueAt: endOfKarachiDay(nthWorkingDayAfter(monthEnd, 10)),
    targetFinalAt: endOfKarachiDay(nthWorkingDayAfter(monthEnd, 12)),
  }
}

export function validateDeadlineOrder(d: KpiMonthDeadlines): string | null {
  if (!(d.goalsLockAt < d.claimsDueAt)) return 'The KPI lock must come before the claims deadline'
  if (!(d.claimsDueAt < d.verifyDueAt)) return 'The claims deadline must come before the verification deadline'
  if (!(d.verifyDueAt < d.responseDueAt)) return 'The verification deadline must come before the response deadline'
  if (!(d.responseDueAt <= d.targetFinalAt)) return 'The response deadline must not be after the month-final date'
  return null
}

export function karachiCalendarDate(instant: Date): CalendarDate {
  return fromUtcMs(instant.getTime() + KARACHI_OFFSET_MS)
}

export function monthKeyOf(instant: Date): MonthKey {
  const date = karachiCalendarDate(instant)
  return { year: date.year, month: date.month }
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

const MIN_YEAR = 2000
const MAX_YEAR = 2100

function inYearRange(year: number): boolean {
  return year >= MIN_YEAR && year <= MAX_YEAR
}

export function parseMonthKey(value: string): MonthKey | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  return inYearRange(year) && month >= 1 && month <= 12 ? { year, month } : null
}

export function formatMonthKey(key: MonthKey): string {
  return `${key.year}-${String(key.month).padStart(2, '0')}`
}

export function parseQuarterKey(value: string): QuarterKey | null {
  const match = /^(\d{4})-Q([1-4])$/.exec(value)
  if (!match || !inYearRange(Number(match[1]))) return null
  return { year: Number(match[1]), quarter: Number(match[2]) as QuarterKey['quarter'] }
}

export function formatQuarterKey(key: QuarterKey): string {
  return `${key.year}-Q${key.quarter}`
}

export function quarterOf(key: MonthKey): QuarterKey {
  return { year: key.year, quarter: (Math.floor((key.month - 1) / 3) + 1) as QuarterKey['quarter'] }
}

export function quarterMonths(key: QuarterKey): MonthKey[] {
  const first = (key.quarter - 1) * 3 + 1
  return [0, 1, 2].map((offset) => ({ year: key.year, month: first + offset }))
}

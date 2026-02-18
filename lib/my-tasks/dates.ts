const DAY_MS = 24 * 60 * 60 * 1000

export function toStartOfDay(input: Date | string): Date {
  const d = typeof input === 'string' ? new Date(input) : new Date(input)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export function addDays(date: Date, days: number): Date {
  return new Date(toStartOfDay(date).getTime() + days * DAY_MS)
}

export function toIsoDate(input: Date): string {
  return toStartOfDay(input).toISOString()
}

export function dateDiffInDays(start: Date | string, end: Date | string): number {
  const s = toStartOfDay(start).getTime()
  const e = toStartOfDay(end).getTime()
  return Math.round((e - s) / DAY_MS)
}

export function isSameOrBefore(a: Date | string, b: Date | string): boolean {
  return toStartOfDay(a).getTime() <= toStartOfDay(b).getTime()
}

export function isBetweenExclusiveInclusive(
  value: Date | string,
  startExclusive: Date | string,
  endInclusive: Date | string
): boolean {
  const v = toStartOfDay(value).getTime()
  const s = toStartOfDay(startExclusive).getTime()
  const e = toStartOfDay(endInclusive).getTime()
  return v > s && v <= e
}

export function withinLastDays(date: Date | string, days: number, now = new Date()): boolean {
  const value = toStartOfDay(date).getTime()
  const lowerBound = addDays(toStartOfDay(now), -days).getTime()
  return value >= lowerBound
}

function toUtcDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function calculateLeaveDays(startDate: Date, endDate: Date): number {
  if (!isValidLeaveDateRange(startDate, endDate)) {
    return 0
  }

  const current = toUtcDateOnly(startDate)
  const last = toUtcDateOnly(endDate)
  let count = 0

  while (current.getTime() <= last.getTime()) {
    const dayOfWeek = current.getUTCDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    if (!isWeekend) {
      count++
    }

    current.setUTCDate(current.getUTCDate() + 1)
  }

  return count
}

export function isValidLeaveDateRange(startDate: Date, endDate: Date): boolean {
  return endDate.getTime() >= startDate.getTime()
}

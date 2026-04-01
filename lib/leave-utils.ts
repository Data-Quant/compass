function toUtcDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function isWeekendDate(date: Date) {
  const day = date.getUTCDay()
  return day === 0 || day === 6
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

export function calculateLeaveDuration(
  startDate: Date,
  endDate: Date,
  isHalfDay: boolean
): number {
  if (isHalfDay) {
    if (!isValidLeaveDateRange(startDate, endDate)) return 0
    const start = toUtcDateOnly(startDate)
    const end = toUtcDateOnly(endDate)
    if (start.getTime() !== end.getTime()) return 0
    if (isWeekendDate(start)) return 0
    return 0.5
  }

  return calculateLeaveDays(startDate, endDate)
}

export function leaveRequiresLeadApproval(
  isHalfDay: boolean,
  superiorLeadCount: number
): boolean {
  return !isHalfDay && superiorLeadCount > 0
}

export function hasLeaveEnded(endDate: Date, now = new Date()): boolean {
  return toUtcDateOnly(endDate).getTime() < toUtcDateOnly(now).getTime()
}

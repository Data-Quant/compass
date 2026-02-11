export function calculateLeaveDays(startDate: Date, endDate: Date): number {
  return Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
}

export function isValidLeaveDateRange(startDate: Date, endDate: Date): boolean {
  return endDate.getTime() >= startDate.getTime()
}

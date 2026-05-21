export const PAYROLL_PERIOD_DELETE_BLOCKED_STATUSES = ['APPROVED', 'SENDING', 'SENT', 'LOCKED'] as const

export function canDeletePayrollPeriodStatus(status: string | null | undefined) {
  return !PAYROLL_PERIOD_DELETE_BLOCKED_STATUSES.includes(status as any)
}

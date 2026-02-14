export interface PayrollReconciliationMismatch {
  payrollName: string
  periodKey: string
  check: string
  expected: number
  actual: number
  delta: number
  severity: 'warning' | 'critical'
  reason: string
}

export function reconcileNetVsPaid(
  payrollName: string,
  periodKey: string,
  netSalary: number,
  paid: number,
  tolerance: number
): PayrollReconciliationMismatch | null {
  const delta = netSalary - paid
  if (Math.abs(delta) <= tolerance) return null
  return {
    payrollName,
    periodKey,
    check: 'NET_VS_PAID',
    expected: netSalary,
    actual: paid,
    delta,
    severity: Math.abs(delta) > tolerance * 5 ? 'critical' : 'warning',
    reason: 'Workbook paid amount deviates from computed net salary beyond tolerance.',
  }
}

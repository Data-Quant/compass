/**
 * Pure payment math for the Payments step. No Prisma — testable without a DB.
 *
 * The rolling balance is previousBalance + Σ(computed − paid) over payable
 * earning categories. Deductions are withheld, not disbursed, so they are not
 * categories here and never affect the balance (spec §3.2).
 */

/** Earning line items that can be marked as paid. Order is display order. */
export const PAYABLE_EARNING_KEYS = [
  'BASIC_SALARY',
  'MEDICAL_ALLOWANCE',
  'BONUS',
  'TRAVEL_REIMBURSEMENT',
  'MOBILE_REIMBURSEMENT',
  'EXPENSE_REIMBURSEMENT',
  'ADVANCE_LOAN',
] as const

export type PaymentCategory = { computed: number; paid: number }
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'PENDING'

/**
 * The fraction of the computed earning line items actually paid.
 *
 * Everything withheld -- income tax and the medical tax exemption -- scales by
 * this ratio, so holding an employee's categories at 0 zeroes their deductions
 * too, and paying in full withholds in full.
 */
export function computePaidRatio(categories: PaymentCategory[]): number {
  const totalComputed = categories.reduce((s, c) => s + c.computed, 0)
  if (totalComputed <= 0) return 0
  return categories.reduce((s, c) => s + c.paid, 0) / totalComputed
}

/**
 * The amount actually disbursed, in net (take-home) terms.
 *
 * The earning columns sum to more than net: the medical allowance is carved out
 * of basic and offset by a tax exemption, and income tax is withheld. Paying
 * every line item in full therefore disburses exactly the payslip's Net Salary,
 * not the column total.
 */
export function computeNetPaid(categories: PaymentCategory[], netSalary: number): number {
  return computePaidRatio(categories) * netSalary
}

/** What is still owed, in net terms: previous balance plus this period's unpaid net. */
export function computeCarriedBalance(
  previousBalance: number,
  netSalary: number,
  netPaid: number
): number {
  return previousBalance + netSalary - netPaid
}

export function computePaidTotal(categories: PaymentCategory[]): number {
  return categories.reduce((sum, c) => sum + c.paid, 0)
}

export function paymentStatus(categories: PaymentCategory[]): PaymentStatus {
  const totalComputed = categories.reduce((s, c) => s + c.computed, 0)
  const totalPaid = categories.reduce((s, c) => s + c.paid, 0)
  if (totalComputed <= 0) return 'PAID' // nothing owed is settled, not pending
  if (totalPaid <= 0) return 'PENDING'
  if (totalPaid >= totalComputed) return 'PAID'
  return 'PARTIAL'
}

/**
 * Whether a receipt should be dispatched at Send. Only receipts that are not
 * already sent (READY or FAILED) go out, and only for an employee who has been
 * paid something this period -- a held (0-paid) salary gets no receipt until it
 * is paid, at which point a re-run of Send picks it up.
 */
export function isSendableReceipt(receiptStatus: string, paidTotal: number): boolean {
  const notYetSent = receiptStatus === 'READY' || receiptStatus === 'FAILED'
  return notYetSent && Number.isFinite(paidTotal) && paidTotal > 0
}

/**
 * Name-only search over the Payments grid rows already loaded in the client.
 *
 * Generic over anything carrying a payrollName so this module stays pure -- it
 * must not import the Prisma-backed row type. Filtering is display-only: the
 * grid still saves every row, not just the visible ones.
 */
export function filterPaymentRows<T extends { payrollName: string }>(
  rows: T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((r) => r.payrollName.toLowerCase().includes(q))
}

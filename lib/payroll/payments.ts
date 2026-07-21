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
  'UTILITY_REIMBURSEMENT',
  'MEALS_REIMBURSEMENT',
  'EXPENSE_REIMBURSEMENT',
  'ADVANCE_LOAN',
] as const

export type PaymentCategory = { computed: number; paid: number }
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'PENDING'

export function computeCarriedBalance(
  previousBalance: number,
  categories: PaymentCategory[]
): number {
  return categories.reduce((sum, c) => sum + (c.computed - c.paid), previousBalance)
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

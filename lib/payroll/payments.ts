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

/**
 * Column headings for the payable earnings, shared by the Payments grid and the
 * Input & Review earnings table.
 *
 * One definition because the two tabs describe the same seven line items and must
 * reconcile. They previously kept separate lists and drifted: Payments abbreviated
 * the headings and hid Reimbursements altogether, so a month with 4.8m of
 * reimbursements showed no sign of them on the tab where they are marked as paid.
 */
export const PAYABLE_EARNING_LABELS: Record<(typeof PAYABLE_EARNING_KEYS)[number], string> = {
  BASIC_SALARY: 'Basic Salary',
  MEDICAL_ALLOWANCE: 'Medical',
  BONUS: 'Bonus',
  TRAVEL_REIMBURSEMENT: 'Travel',
  MOBILE_REIMBURSEMENT: 'Mobile',
  EXPENSE_REIMBURSEMENT: 'Reimbursements',
  ADVANCE_LOAN: 'Advance Loan',
}

export type PaymentCategory = { computed: number; paid: number }
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'PENDING'

/**
 * One employee's categories, from computed earnings and recorded payments.
 *
 * `paid` comes only from what has actually been recorded. An employee with no
 * PayrollPayment rows is owed everything, not paid everything -- replacing the old
 * Auto-Paid assumption with real disbursements is the entire reason this step exists.
 *
 * This previously defaulted `paid` to `computed` so the grid inputs opened pre-filled.
 * That default reached the derived Paid, Balance and Status as well, so a period
 * nobody had paid displayed as fully settled. Pre-filling is a UI affordance and
 * belongs in the UI, behind an explicit action -- never in the numbers.
 *
 * Every payable key is returned even when the payslip omits it, so the grid renders a
 * stable set of columns.
 */
export function buildPaymentCategories(
  computedByKey: Record<string, number>,
  recordedPaidByKey: ReadonlyMap<string, number> | undefined
): Array<{ componentKey: string; computed: number; paid: number }> {
  return PAYABLE_EARNING_KEYS.map((key) => {
    const raw = computedByKey[key]
    const computed = Number.isFinite(raw) ? Number(raw) : 0
    return { componentKey: key, computed, paid: recordedPaidByKey?.get(key) ?? 0 }
  })
}

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

/**
 * Spread one net (take-home) payment across the earning categories in proportion.
 *
 * The grid takes a single Paid figure, but PayrollPayment is keyed per category and
 * the engine, the payslip and the reconciliation all read it that way. Rather than
 * introduce a second storage shape for the same fact, the net figure is distributed
 * over the categories by their share of the computed total.
 *
 * The split is the exact inverse of computeNetPaid, so a figure entered here reads
 * back unchanged: paying the full net marks every category at its computed amount,
 * and paying half marks half of each.
 *
 * A consequence worth knowing: because the split is proportional, this cannot express
 * "paid the salary but held the bonus". Holding one line item independently needs
 * per-category entry, which this grid no longer offers.
 */
export function distributeNetPaidAcrossCategories(
  categories: PaymentCategory[],
  netSalary: number,
  paidNet: number
): PaymentCategory[] {
  // Nothing to divide by, so nothing can be attributed.
  const ratio = netSalary > 0 ? paidNet / netSalary : 0
  return categories.map((c) => ({ computed: c.computed, paid: c.computed * ratio }))
}

export function paymentStatus(categories: PaymentCategory[]): PaymentStatus {
  const totalComputed = categories.reduce((s, c) => s + c.computed, 0)
  const totalPaid = categories.reduce((s, c) => s + c.paid, 0)
  if (totalComputed <= 0) return 'PAID' // nothing owed is settled, not pending
  if (totalPaid <= 0) return 'PENDING'
  if (totalPaid >= totalComputed) return 'PAID'
  return 'PARTIAL'
}

export type PaymentRowTotals = {
  netSalary: number
  previousBalance: number
  paidNet: number
  balance: number
}

/**
 * Column totals for the Payments footer.
 *
 * Previous Balance is totalled alongside the three headline columns even though it
 * is the quieter one: without it the footer shows a Balance that does not equal Net
 * Amount minus Paid, and reads as an arithmetic error to anyone who checks it.
 *
 * Summed from the live per-row values rather than recomputed from the total, so the
 * footer always agrees with the rows above it.
 */
export function sumPaymentTotals(rows: readonly PaymentRowTotals[]): PaymentRowTotals {
  return rows.reduce<PaymentRowTotals>(
    (acc, row) => ({
      netSalary: acc.netSalary + row.netSalary,
      previousBalance: acc.previousBalance + row.previousBalance,
      paidNet: acc.paidNet + row.paidNet,
      balance: acc.balance + row.balance,
    }),
    { netSalary: 0, previousBalance: 0, paidNet: 0, balance: 0 }
  )
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

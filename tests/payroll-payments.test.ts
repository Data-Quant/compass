import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeCarriedBalance,
  computePaidTotal,
  computePaidRatio,
  computeNetPaid,
  paymentStatus,
  buildPaymentCategories,
  isSendableReceipt,
  filterPaymentRows,
  PAYABLE_EARNING_KEYS,
  type PaymentCategory,
} from '../lib/payroll/payments'

// Amounts are invented. Real salary figures never enter this repo -- it is public.
const cat = (computed: number, paid: number): PaymentCategory => ({ computed, paid })

// The payslip shape: earning line items sum to more than net, because the
// medical carve-out is offset by a tax exemption and tax is withheld.
// categories 297,000 -> net 246,610 (exemption 27,000 + deductions 23,390).
const slipCategories = [cat(270_000, 270_000), cat(27_000, 27_000)]
const SLIP_NET = 246_610

test('computePaidRatio: fully paid is 1, nothing paid is 0, half is 0.5', () => {
  assert.equal(computePaidRatio(slipCategories), 1)
  assert.equal(computePaidRatio([cat(270_000, 0), cat(27_000, 0)]), 0)
  assert.equal(computePaidRatio([cat(270_000, 135_000), cat(27_000, 13_500)]), 0.5)
})

test('computePaidRatio: nothing owed is 0, never a divide-by-zero', () => {
  assert.equal(computePaidRatio([cat(0, 0)]), 0)
  assert.equal(computePaidRatio([]), 0)
})

test('computeNetPaid: paying every line item in full disburses exactly net salary', () => {
  // The whole point: the grid must agree with the payslip's Net Salary.
  assert.equal(computeNetPaid(slipCategories, SLIP_NET), SLIP_NET)
})

test('computeNetPaid: holding a salary disburses nothing', () => {
  assert.equal(computeNetPaid([cat(270_000, 0), cat(27_000, 0)], SLIP_NET), 0)
})

test('computeNetPaid: a half payment disburses half the net', () => {
  assert.equal(computeNetPaid([cat(270_000, 135_000), cat(27_000, 13_500)], SLIP_NET), SLIP_NET / 2)
})

test('computeCarriedBalance: fully paid carries only the previous balance', () => {
  assert.equal(computeCarriedBalance(0, SLIP_NET, SLIP_NET), 0)
  assert.equal(computeCarriedBalance(3_000, SLIP_NET, SLIP_NET), 3_000)
})

test('computeCarriedBalance: a held salary carries the NET owed, not the gross', () => {
  // 246,610 owed -- not the 297,000 the earning columns add up to.
  assert.equal(computeCarriedBalance(0, SLIP_NET, 0), SLIP_NET)
  assert.equal(computeCarriedBalance(2_000, SLIP_NET, 0), 2_000 + SLIP_NET)
})

test('computeCarriedBalance: a half payment carries half the net', () => {
  assert.equal(computeCarriedBalance(0, SLIP_NET, SLIP_NET / 2), SLIP_NET / 2)
})

test('computePaidTotal sums the paid amounts', () => {
  assert.equal(computePaidTotal([cat(50_000, 40_000), cat(5_000, 5_000)]), 45_000)
})

test('paymentStatus: PAID when total paid >= total computed', () => {
  assert.equal(paymentStatus([cat(50_000, 50_000), cat(5_000, 5_000)]), 'PAID')
})

test('paymentStatus: PENDING when nothing is paid', () => {
  assert.equal(paymentStatus([cat(50_000, 0), cat(5_000, 0)]), 'PENDING')
})

test('paymentStatus: PARTIAL when some but not all is paid', () => {
  assert.equal(paymentStatus([cat(50_000, 50_000), cat(5_000, 0)]), 'PARTIAL')
})

test('paymentStatus: PAID when nothing is owed (zero computed earnings)', () => {
  // A zero-earnings row owes nothing, so it is settled, not pending.
  assert.equal(paymentStatus([cat(0, 0), cat(0, 0)]), 'PAID')
  assert.equal(paymentStatus([]), 'PAID')
})

test('PAYABLE_EARNING_KEYS holds the earning categories and no deductions', () => {
  assert.ok(PAYABLE_EARNING_KEYS.includes('BASIC_SALARY'))
  assert.ok(PAYABLE_EARNING_KEYS.includes('TRAVEL_REIMBURSEMENT'))
  assert.ok(!PAYABLE_EARNING_KEYS.includes('INCOME_TAX'))
  assert.ok(!PAYABLE_EARNING_KEYS.includes('PAID'))
})

// ─── isSendableReceipt ──────────────────────────────────────────────────────
// A receipt is dispatched only if not already sent AND the employee was paid
// something. Held (0-paid) salaries get no receipt until paid.

test('isSendableReceipt: a READY receipt with paid > 0 is sendable', () => {
  assert.equal(isSendableReceipt('READY', 55_000), true)
})

test('isSendableReceipt: a READY receipt with 0 paid (held) is not sendable', () => {
  assert.equal(isSendableReceipt('READY', 0), false)
})

test('isSendableReceipt: an already-sent receipt is not re-sent even if paid', () => {
  assert.equal(isSendableReceipt('SENT', 55_000), false)
})

test('isSendableReceipt: a FAILED receipt with paid > 0 is sendable (retry)', () => {
  assert.equal(isSendableReceipt('FAILED', 55_000), true)
})

test('isSendableReceipt: negative or NaN paid is not sendable', () => {
  assert.equal(isSendableReceipt('READY', -1), false)
  assert.equal(isSendableReceipt('READY', Number.NaN), false)
})

// ─── filterPaymentRows ──────────────────────────────────────────────────────
// Name-only search over the rows already loaded in the Payments grid.

const nameRows = [
  { payrollName: 'Alpha Example' },
  { payrollName: 'beta sample' },
  { payrollName: 'Gamma Alpha' },
]

test('filterPaymentRows: an empty or blank query returns every row', () => {
  assert.equal(filterPaymentRows(nameRows, '').length, 3)
  assert.equal(filterPaymentRows(nameRows, '   ').length, 3)
})

test('filterPaymentRows: matches on name, case-insensitively', () => {
  assert.deepEqual(
    filterPaymentRows(nameRows, 'BETA').map((r) => r.payrollName),
    ['beta sample']
  )
})

test('filterPaymentRows: matches a partial name anywhere in the string', () => {
  assert.deepEqual(
    filterPaymentRows(nameRows, 'alpha').map((r) => r.payrollName),
    ['Alpha Example', 'Gamma Alpha']
  )
})

test('filterPaymentRows: surrounding whitespace is ignored', () => {
  assert.deepEqual(
    filterPaymentRows(nameRows, '  gamma  ').map((r) => r.payrollName),
    ['Gamma Alpha']
  )
})

test('filterPaymentRows: no match returns empty, never everything', () => {
  assert.deepEqual(filterPaymentRows(nameRows, 'zzzz'), [])
})

test('filterPaymentRows: preserves input order and does not mutate', () => {
  const before = nameRows.map((r) => r.payrollName)
  const out = filterPaymentRows(nameRows, 'a')
  assert.deepEqual(out.map((r) => r.payrollName), ['Alpha Example', 'beta sample', 'Gamma Alpha'])
  assert.deepEqual(nameRows.map((r) => r.payrollName), before)
})

// --- Categories are built from recorded payments, never assumed ---
//
// Regression: the Payments grid defaulted each paid cell to its computed amount
// when an employee had no PayrollPayment rows. That was meant to pre-fill the
// inputs, but it fed the derived Paid/Balance/Status, so July 2026 -- 39
// employees, zero payment records, period still CALCULATED -- displayed every
// row as PAID with a zero balance. The whole point of the Payments step was to
// replace the old Auto-Paid assumption with recorded disbursements.

test('an employee with no recorded payments is owed everything, not paid', () => {
  const computed = { BASIC_SALARY: 250_000, MEDICAL_ALLOWANCE: 27_000, BONUS: 20_000 }
  const categories = buildPaymentCategories(computed, undefined)

  assert.deepEqual(
    categories.filter((c) => c.computed > 0).map((c) => [c.componentKey, c.paid]),
    [['BASIC_SALARY', 0], ['MEDICAL_ALLOWANCE', 0], ['BONUS', 0]],
  )
  assert.equal(paymentStatus(categories), 'PENDING')
  assert.equal(computePaidTotal(categories), 0)
})

test('recorded payments are used exactly as recorded', () => {
  const computed = { BASIC_SALARY: 250_000, BONUS: 20_000 }
  const recorded = new Map([['BASIC_SALARY', 250_000], ['BONUS', 0]])
  const categories = buildPaymentCategories(computed, recorded)

  assert.equal(categories.find((c) => c.componentKey === 'BASIC_SALARY')?.paid, 250_000)
  assert.equal(categories.find((c) => c.componentKey === 'BONUS')?.paid, 0)
  assert.equal(paymentStatus(categories), 'PARTIAL')
})

test('a recorded zero stays zero rather than falling back to computed', () => {
  // A deliberately held salary: the row exists and says nothing was paid.
  const categories = buildPaymentCategories({ BASIC_SALARY: 250_000 }, new Map([['BASIC_SALARY', 0]]))
  assert.equal(paymentStatus(categories), 'PENDING')
  assert.equal(computePaidTotal(categories), 0)
})

test('every payable key is present even when the payslip omits it', () => {
  // The grid renders a column per payable key, so a missing earning must appear
  // as a zero row rather than vanishing and shifting the columns.
  const categories = buildPaymentCategories({ BASIC_SALARY: 100 }, undefined)
  assert.deepEqual(
    categories.map((c) => c.componentKey),
    [...PAYABLE_EARNING_KEYS],
  )
})

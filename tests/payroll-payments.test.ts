import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeCarriedBalance,
  computePaidTotal,
  computePaidRatio,
  computeNetPaid,
  distributeNetPaidAcrossCategories,
  paymentStatus,
  buildPaymentCategories,
  isSendableReceipt,
  filterPaymentRows,
  PAYABLE_EARNING_KEYS,
  PAYABLE_EARNING_LABELS,
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

// --- The Payments grid must show the same earnings as Input & Review ---
//
// The two tabs describe the same seven earning line items and their amounts
// already agree exactly. They drifted apart in presentation: Payments hid
// EXPENSE_REIMBURSEMENT entirely and abbreviated the rest, so July's 4.8m of
// reimbursements was invisible on the tab where it gets marked as paid.

test('every payable category has a label', () => {
  assert.deepEqual(
    [...PAYABLE_EARNING_KEYS].sort(),
    Object.keys(PAYABLE_EARNING_LABELS).sort(),
  )
})

test('labels match the Input & Review earnings table wording', () => {
  // These strings are EARNINGS_COLUMNS in PayrollEmployeeGrid. Both grids read
  // them from here, so the two tabs cannot describe the same column differently.
  assert.equal(PAYABLE_EARNING_LABELS.BASIC_SALARY, 'Basic Salary')
  assert.equal(PAYABLE_EARNING_LABELS.MEDICAL_ALLOWANCE, 'Medical')
  assert.equal(PAYABLE_EARNING_LABELS.BONUS, 'Bonus')
  assert.equal(PAYABLE_EARNING_LABELS.TRAVEL_REIMBURSEMENT, 'Travel')
  assert.equal(PAYABLE_EARNING_LABELS.MOBILE_REIMBURSEMENT, 'Mobile')
  assert.equal(PAYABLE_EARNING_LABELS.EXPENSE_REIMBURSEMENT, 'Reimbursements')
  assert.equal(PAYABLE_EARNING_LABELS.ADVANCE_LOAN, 'Advance Loan')
})

// --- A single net Paid figure, stored per category ---
//
// The grid now takes one editable Paid amount in net (take-home) terms, but
// PayrollPayment is keyed per earning category and the engine reads it that way.
// Spreading the net figure across the categories in proportion keeps one storage
// model, so the engine, the payslip and the grid cannot disagree.

test('distributing a net amount round-trips back through computeNetPaid', () => {
  // Categories sum to more than net: the medical carve-out is offset by a tax
  // exemption and tax is withheld, so 297,000 of line items is 246,610 take-home.
  const categories = [cat(250_000, 0), cat(27_000, 0), cat(20_000, 0)]
  const net = 246_610

  for (const paidNet of [0, 100_000, 246_610]) {
    const spread = distributeNetPaidAcrossCategories(categories, net, paidNet)
    assert.equal(
      Math.round(computeNetPaid(spread, net)),
      paidNet,
      `paying ${paidNet} should read back as ${paidNet}`,
    )
  }
})

test('paying in full marks every category at its computed amount', () => {
  const categories = [cat(250_000, 0), cat(27_000, 0)]
  const spread = distributeNetPaidAcrossCategories(categories, 246_610, 246_610)
  assert.deepEqual(spread.map((c) => Math.round(c.paid)), [250_000, 27_000])
})

test('paying nothing leaves every category at zero', () => {
  const spread = distributeNetPaidAcrossCategories([cat(250_000, 0), cat(27_000, 0)], 246_610, 0)
  assert.deepEqual(spread.map((c) => c.paid), [0, 0])
})

test('a zero net salary cannot be divided by, and pays nothing', () => {
  const spread = distributeNetPaidAcrossCategories([cat(0, 0)], 0, 5_000)
  assert.deepEqual(spread.map((c) => c.paid), [0])
})

test('a part payment splits in proportion to what each category is worth', () => {
  // Half the take-home paid means half of each line item recorded.
  const spread = distributeNetPaidAcrossCategories([cat(200_000, 0), cat(100_000, 0)], 250_000, 125_000)
  assert.deepEqual(spread.map((c) => Math.round(c.paid)), [100_000, 50_000])
})

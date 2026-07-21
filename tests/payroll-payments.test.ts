import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeCarriedBalance,
  computePaidTotal,
  paymentStatus,
  isSendableReceipt,
  PAYABLE_EARNING_KEYS,
  type PaymentCategory,
} from '../lib/payroll/payments'

// Amounts are invented. Real salary figures never enter this repo -- it is public.
const cat = (computed: number, paid: number): PaymentCategory => ({ computed, paid })

test('all categories paid in full carries only the previous balance', () => {
  const cats = [cat(50_000, 50_000), cat(5_000, 5_000)]
  assert.equal(computeCarriedBalance(0, cats), 0)
  assert.equal(computeCarriedBalance(3_000, cats), 3_000)
})

test('a held-back category carries as balance on top of previous', () => {
  const cats = [cat(50_000, 50_000), cat(5_000, 0)] // travel not paid
  assert.equal(computeCarriedBalance(0, cats), 5_000)
  assert.equal(computeCarriedBalance(2_000, cats), 7_000)
})

test('nothing paid carries the full computed earnings', () => {
  const cats = [cat(50_000, 0), cat(5_000, 0)]
  assert.equal(computeCarriedBalance(0, cats), 55_000)
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

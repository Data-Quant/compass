import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeAutoMedicalAllowance,
  computeEarningsBreakdown,
  computeTravelPayable,
  resolveValidUserId,
  type SalaryHeadLite,
} from '../lib/payroll/engine'

const heads = new Map<string, SalaryHeadLite>([
  ['BASIC_SALARY', { type: 'EARNING', isTaxable: true }],
  ['MEDICAL_ALLOWANCE', { type: 'EARNING', isTaxable: false }],
  ['MOBILE_REIMBURSEMENT', { type: 'EARNING', isTaxable: false }],
  ['OVERTIME', { type: 'EARNING', isTaxable: true }],
  ['INTERNET_ALLOWANCE', { type: 'EARNING', isTaxable: false }],
  ['EOBI', { type: 'DEDUCTION', isTaxable: false }],
])

test('computeEarningsBreakdown does not double count basic salary as additional taxable earnings', () => {
  const breakdown = computeEarningsBreakdown(
    { BASIC_SALARY: 270_000, MEDICAL_ALLOWANCE: 27_000 },
    heads
  )

  assert.equal(breakdown.additionalEarnings, 0)
  assert.equal(breakdown.additionalTaxableEarnings, 0)
  assert.equal(breakdown.additionalNonTaxableEarnings, 0)
})

test('computeEarningsBreakdown counts custom taxable and non-taxable earning heads', () => {
  const breakdown = computeEarningsBreakdown(
    {
      BASIC_SALARY: 270_000,
      OVERTIME: 30_000,
      INTERNET_ALLOWANCE: 5_000,
    },
    heads
  )

  assert.equal(breakdown.additionalEarnings, 35_000)
  assert.equal(breakdown.additionalTaxableEarnings, 30_000)
  assert.equal(breakdown.additionalNonTaxableEarnings, 5_000)
})

test('computeEarningsBreakdown ignores deduction heads and unknown component keys', () => {
  const breakdown = computeEarningsBreakdown(
    {
      BASIC_SALARY: 270_000,
      EOBI: 1_500,
      SOME_RANDOM_KEY: 9_999,
    },
    heads
  )

  assert.equal(breakdown.additionalEarnings, 0)
  assert.equal(breakdown.additionalTaxableEarnings, 0)
})

test('computeAutoMedicalAllowance carves 10% of basic salary', () => {
  assert.equal(computeAutoMedicalAllowance(270_000), 27_000)
  assert.equal(computeAutoMedicalAllowance(125_555), 12_555.5)
})

test('computeAutoMedicalAllowance returns zero for non-positive basic', () => {
  assert.equal(computeAutoMedicalAllowance(0), 0)
  assert.equal(computeAutoMedicalAllowance(-50_000), 0)
})

test('computeTravelPayable prorates the monthly rate by attendance', () => {
  // 14 of 21 days present at a 40,000 monthly rate.
  assert.equal(computeTravelPayable(40_000, 14, 21), 26666.67)
  // Full attendance pays the full rate.
  assert.equal(computeTravelPayable(32_000, 21, 21), 32_000)
})

test('computeTravelPayable pays nothing for zero present days', () => {
  assert.equal(computeTravelPayable(40_000, 0, 21), 0)
})

test('computeTravelPayable never exceeds the full monthly rate', () => {
  // Present days above working days (e.g. extra logged days) are capped.
  assert.equal(computeTravelPayable(40_000, 25, 21), 40_000)
})

test('computeTravelPayable returns zero when there are no working days', () => {
  assert.equal(computeTravelPayable(40_000, 10, 0), 0)
})

test('resolveValidUserId keeps existing users and nulls dangling/empty ones', () => {
  const valid = new Set(['u1', 'u2'])
  assert.equal(resolveValidUserId('u1', valid), 'u1')
  // A carried-forward userId for a since-deleted user must become null so the
  // receipt foreign key does not abort the calculation.
  assert.equal(resolveValidUserId('deleted-user', valid), null)
  assert.equal(resolveValidUserId(null, valid), null)
  assert.equal(resolveValidUserId(undefined, valid), null)
})


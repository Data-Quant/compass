import test from 'node:test'
import assert from 'node:assert/strict'
import { computeEarningsBreakdown, type SalaryHeadLite } from '../lib/payroll/engine'

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

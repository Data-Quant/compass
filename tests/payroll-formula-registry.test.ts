import test from 'node:test'
import assert from 'node:assert/strict'
import { estimateIncomeTaxFromSlabs, FIX_IDS, FORMULA_VERSION } from '../lib/payroll/formula-registry'

test('formula version and fix catalog are defined', () => {
  assert.equal(typeof FORMULA_VERSION, 'string')
  assert.equal(FORMULA_VERSION.length > 0, true)
  assert.equal(FIX_IDS.TRAVEL_SUMIF_RANGE.startsWith('FIX_'), true)
  assert.equal(FIX_IDS.GROSS_MEDICAL_ALIGNMENT.startsWith('FIX_'), true)
  assert.equal(FIX_IDS.TAX_SLAB_REF_BOUNDS.startsWith('FIX_'), true)
  assert.equal(FIX_IDS.PAID_BALANCE_ROLLING.startsWith('FIX_'), true)
})

test('tax estimator returns zero for non-positive monthly taxable amount', () => {
  assert.equal(estimateIncomeTaxFromSlabs('01/2026', 0), 0)
  assert.equal(estimateIncomeTaxFromSlabs('01/2026', -5000), 0)
})

test('tax estimator increases with higher taxable salary in same period', () => {
  const low = estimateIncomeTaxFromSlabs('01/2026', 80000)
  const high = estimateIncomeTaxFromSlabs('01/2026', 250000)
  assert.equal(high > low, true)
})

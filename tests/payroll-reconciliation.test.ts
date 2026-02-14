import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileNetVsPaid } from '../lib/payroll/reconciliation'

test('reconcileNetVsPaid returns null when within tolerance', () => {
  const mismatch = reconcileNetVsPaid('Ali', '02/2026', 100000, 100000.5, 1)
  assert.equal(mismatch, null)
})

test('reconcileNetVsPaid flags critical deltas', () => {
  const mismatch = reconcileNetVsPaid('Ali', '02/2026', 100000, 90000, 100)
  assert.equal(mismatch?.severity, 'critical')
  assert.equal(Boolean(mismatch), true)
})

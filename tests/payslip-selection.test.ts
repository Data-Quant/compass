import test from 'node:test'
import assert from 'node:assert/strict'
import {
  eligiblePayslipReceiptIds,
  togglePayslipSelection,
  toggleAllPayslipSelection,
} from '../lib/payroll/payments'

const receipts = [
  { id: 'r1', status: 'READY', payrollName: 'Ada' },
  { id: 'r2', status: 'FAILED', payrollName: 'Bob' },
  { id: 'r3', status: 'SENT', payrollName: 'Cy' },
  { id: 'r4', status: 'READY', payrollName: 'Dee' }, // held at 0 paid
  { id: 'r5', status: 'DRAFT', payrollName: 'Eve' },
]
const paidByName = new Map([
  ['Ada', 100],
  ['Bob', 50],
  ['Cy', 100],
  ['Dee', 0],
  ['Eve', 100],
])

test('eligiblePayslipReceiptIds keeps only READY/FAILED receipts with pay recorded', () => {
  assert.deepEqual(eligiblePayslipReceiptIds(receipts, paidByName), ['r1', 'r2'])
})

test('togglePayslipSelection returns a new set with the id flipped', () => {
  const initial = new Set(['r1'])
  const added = togglePayslipSelection(initial, 'r2')
  assert.deepEqual([...added].sort(), ['r1', 'r2'])
  const removed = togglePayslipSelection(added, 'r1')
  assert.deepEqual([...removed], ['r2'])
  assert.deepEqual([...initial], ['r1'], 'original set must not be mutated')
})

test('toggleAllPayslipSelection selects every eligible id, or clears when all are already selected', () => {
  const eligible = ['r1', 'r2']
  assert.deepEqual([...toggleAllPayslipSelection(new Set(), eligible)].sort(), eligible)
  assert.deepEqual([...toggleAllPayslipSelection(new Set(['r1']), eligible)].sort(), eligible)
  assert.deepEqual([...toggleAllPayslipSelection(new Set(['r1', 'r2']), eligible)], [])
  // stale ids that are no longer eligible are dropped
  assert.deepEqual([...toggleAllPayslipSelection(new Set(['r9']), eligible)].sort(), eligible)
})

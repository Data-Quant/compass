import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CARRY_FORWARD_COMPONENT_KEYS,
  isCarryForwardEligible,
  selectCarryForwardInputs,
  type CarryForwardEmployeeStatus,
} from '../lib/payroll/carry-forward'

const TARGET_START = new Date('2026-07-01T00:00:00.000Z')

const active: CarryForwardEmployeeStatus = { exists: true, isPayrollActive: true, exitDate: null }

test('only BASIC_SALARY is a carry-forward component', () => {
  assert.equal(CARRY_FORWARD_COMPONENT_KEYS.has('BASIC_SALARY'), true)
  assert.equal(CARRY_FORWARD_COMPONENT_KEYS.has('MEDICAL_ALLOWANCE'), false)
  assert.equal(CARRY_FORWARD_COMPONENT_KEYS.has('TRAVEL_REIMBURSEMENT'), false)
  assert.equal(CARRY_FORWARD_COMPONENT_KEYS.has('BONUS'), false)
})

test('unmapped rows (no linked user) are eligible', () => {
  assert.equal(isCarryForwardEligible(null, TARGET_START), true)
})

test('active, non-offboarded employees are eligible', () => {
  assert.equal(isCarryForwardEligible(active, TARGET_START), true)
  // Exit date in the future (leaving later) still gets this month.
  assert.equal(
    isCarryForwardEligible({ ...active, exitDate: new Date('2026-07-20T00:00:00.000Z') }, TARGET_START),
    true
  )
})

test('deleted, deactivated, or previously-offboarded employees are excluded', () => {
  // Permanently deleted (no User row).
  assert.equal(
    isCarryForwardEligible({ exists: false, isPayrollActive: false, exitDate: null }, TARGET_START),
    false
  )
  // Deactivated by HR.
  assert.equal(isCarryForwardEligible({ ...active, isPayrollActive: false }, TARGET_START), false)
  // Offboarded in the previous month (exit before target period starts).
  assert.equal(
    isCarryForwardEligible({ ...active, exitDate: new Date('2026-06-20T00:00:00.000Z') }, TARGET_START),
    false
  )
})

test('selectCarryForwardInputs keeps only salary rows for eligible employees', () => {
  const rows = [
    { componentKey: 'BASIC_SALARY', userId: 'u-active' },
    { componentKey: 'MEDICAL_ALLOWANCE', userId: 'u-active' }, // dropped: not salary
    { componentKey: 'TRAVEL_REIMBURSEMENT', userId: 'u-active' }, // dropped: not salary
    { componentKey: 'BASIC_SALARY', userId: 'u-offboarded' }, // dropped: offboarded
    { componentKey: 'BASIC_SALARY', userId: 'u-deleted' }, // dropped: deleted
    { componentKey: 'BASIC_SALARY', userId: null }, // kept: unmapped
  ]

  const statuses: Record<string, CarryForwardEmployeeStatus> = {
    'u-active': active,
    'u-offboarded': { ...active, exitDate: new Date('2026-06-15T00:00:00.000Z') },
    'u-deleted': { exists: false, isPayrollActive: false, exitDate: null },
  }
  const resolve = (userId: string | null) => (userId ? statuses[userId] ?? { exists: false, isPayrollActive: false, exitDate: null } : null)

  const carried = selectCarryForwardInputs(rows, resolve, TARGET_START)
  assert.deepEqual(
    carried.map((r) => `${r.componentKey}:${r.userId}`),
    ['BASIC_SALARY:u-active', 'BASIC_SALARY:null']
  )
})

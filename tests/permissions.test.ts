import test from 'node:test'
import assert from 'node:assert/strict'
import { canManagePayroll, canManageSupport, isAdminRole } from '../lib/permissions'

test('isAdminRole grants HR and OA only', () => {
  assert.equal(isAdminRole('HR'), true)
  assert.equal(isAdminRole('OA'), true)
  assert.equal(isAdminRole('SECURITY'), false)
  assert.equal(isAdminRole('EMPLOYEE'), false)
})

test('payroll management follows admin-role matrix', () => {
  assert.equal(canManagePayroll('HR'), true)
  assert.equal(canManagePayroll('OA'), true)
  assert.equal(canManagePayroll('SECURITY'), false)
  assert.equal(canManagePayroll('EMPLOYEE'), false)
})

test('support management allows HR and SECURITY only', () => {
  assert.equal(canManageSupport('HR'), true)
  assert.equal(canManageSupport('SECURITY'), true)
  assert.equal(canManageSupport('OA'), false)
  assert.equal(canManageSupport('EMPLOYEE'), false)
})

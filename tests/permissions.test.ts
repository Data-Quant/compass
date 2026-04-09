import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canCompleteSecurityChecklist,
  canEditPayrollMaster,
  canManageAssets,
  canManageOnboarding,
  canManagePayroll,
  canManageSubscriptions,
  canManageSupport,
  isAdminRole,
} from '../lib/permissions'

test('isAdminRole grants HR only', () => {
  assert.equal(isAdminRole('HR'), true)
  assert.equal(isAdminRole('OA'), false)
  assert.equal(isAdminRole('EXECUTION'), false)
  assert.equal(isAdminRole('SECURITY'), false)
  assert.equal(isAdminRole('EMPLOYEE'), false)
})

test('payroll management follows admin-role matrix', () => {
  assert.equal(canManagePayroll('HR'), true)
  assert.equal(canManagePayroll('OA'), true)
  assert.equal(canManagePayroll('SECURITY'), false)
  assert.equal(canManagePayroll('EXECUTION'), false)
  assert.equal(canManagePayroll('EMPLOYEE'), false)
})

test('payroll master editing is HR-only', () => {
  assert.equal(canEditPayrollMaster('HR'), true)
  assert.equal(canEditPayrollMaster('OA'), false)
  assert.equal(canEditPayrollMaster('SECURITY'), false)
  assert.equal(canEditPayrollMaster('EMPLOYEE'), false)
})

test('support management allows HR and SECURITY only', () => {
  assert.equal(canManageSupport('HR'), true)
  assert.equal(canManageSupport('SECURITY'), true)
  assert.equal(canManageSupport('OA'), false)
  assert.equal(canManageSupport('EXECUTION'), false)
  assert.equal(canManageSupport('EMPLOYEE'), false)
})

test('asset management allows HR and SECURITY only', () => {
  assert.equal(canManageAssets('HR'), true)
  assert.equal(canManageAssets('SECURITY'), true)
  assert.equal(canManageAssets('OA'), false)
  assert.equal(canManageAssets('EXECUTION'), false)
  assert.equal(canManageAssets('EMPLOYEE'), false)
})

test('onboarding management is HR-only', () => {
  assert.equal(canManageOnboarding('HR'), true)
  assert.equal(canManageOnboarding('SECURITY'), false)
  assert.equal(canManageOnboarding('OA'), false)
  assert.equal(canManageOnboarding('EXECUTION'), false)
  assert.equal(canManageOnboarding('EMPLOYEE'), false)
})

test('security checklist completion allows HR and SECURITY', () => {
  assert.equal(canCompleteSecurityChecklist('HR'), true)
  assert.equal(canCompleteSecurityChecklist('SECURITY'), true)
  assert.equal(canCompleteSecurityChecklist('OA'), false)
  assert.equal(canCompleteSecurityChecklist('EXECUTION'), false)
  assert.equal(canCompleteSecurityChecklist('EMPLOYEE'), false)
})

test('subscription management allows HR and EXECUTION only', () => {
  assert.equal(canManageSubscriptions('HR'), true)
  assert.equal(canManageSubscriptions('EXECUTION'), true)
  assert.equal(canManageSubscriptions('OA'), false)
  assert.equal(canManageSubscriptions('SECURITY'), false)
  assert.equal(canManageSubscriptions('EMPLOYEE'), false)
})

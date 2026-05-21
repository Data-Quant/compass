import test from 'node:test'
import assert from 'node:assert/strict'
import { isEligiblePayrollEmployee } from '../lib/payroll/employee-eligibility'

test('payroll eligibility excludes 3E and Noble employees', () => {
  assert.equal(isEligiblePayrollEmployee({ name: 'Ali', department: '3E', position: 'Analyst' }), false)
  assert.equal(
    isEligiblePayrollEmployee({
      name: 'Sara',
      department: 'Technology',
      position: 'Analyst',
      payrollProfile: {
        department: { name: 'Noble' },
      },
    }),
    false
  )
})

test('payroll eligibility excludes partners but keeps junior partners', () => {
  assert.equal(isEligiblePayrollEmployee({ name: 'Partner User', department: 'Executive', position: 'Partner' }), false)
  assert.equal(
    isEligiblePayrollEmployee({
      name: 'Operating Partner User',
      department: 'Executive',
      position: 'Operating Partner',
    }),
    false
  )
  assert.equal(
    isEligiblePayrollEmployee({
      name: 'Ammar Hassan',
      department: 'Technology',
      position: 'Junior Partner',
    }),
    true
  )
  assert.equal(
    isEligiblePayrollEmployee({
      name: 'Areebah Akhlaque',
      department: 'Human Resources',
      position: 'Principal and Junior Partner',
    }),
    true
  )
})

test('payroll eligibility excludes inactive payroll profiles', () => {
  assert.equal(
    isEligiblePayrollEmployee({
      name: 'Inactive Employee',
      department: 'Product',
      position: 'Associate',
      payrollProfile: {
        isPayrollActive: false,
      },
    }),
    false
  )
})

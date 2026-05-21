import test from 'node:test'
import assert from 'node:assert/strict'
import { isEligiblePayrollEmployee, toPayrollEmployeeListItem } from '../lib/payroll/employee-eligibility'

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

test('payroll employee list item strips sensitive payroll profile fields', () => {
  const employee = toPayrollEmployeeListItem({
    id: 'user-1',
    name: 'Ayesha',
    role: 'EMPLOYEE',
    department: 'Technology',
    position: 'Associate',
    payrollProfile: {
      isPayrollActive: true,
      designation: 'Backend Engineer',
      department: { name: 'Technology' },
      employmentType: { name: 'Full Time' },
      cnicNumber: 'should-not-leak',
      bankName: 'should-not-leak',
      accountTitle: 'should-not-leak',
      accountNumber: 'should-not-leak',
    } as any,
  })

  assert.equal(employee.role, 'Backend Engineer')
  const serialized = JSON.stringify(employee)
  assert.equal(serialized.includes('should-not-leak'), false)
  assert.equal(serialized.includes('cnicNumber'), false)
  assert.equal(serialized.includes('bankName'), false)
  assert.equal(serialized.includes('accountNumber'), false)
})

test('payroll employee list item can include payroll details for authorized payroll routes', () => {
  const employee = toPayrollEmployeeListItem(
    {
      id: 'user-1',
      name: 'Ayesha',
      role: 'EMPLOYEE',
      department: 'Technology',
      position: 'Associate',
      payrollProfile: {
        isPayrollActive: true,
        designation: 'Backend Engineer',
        department: { name: 'Technology' },
        employmentType: { name: 'Full Time' },
        officialEmail: 'ayesha@plutus21.com',
        cnicNumber: '12345-1234567-1',
        bankName: 'Bank',
        accountTitle: 'Ayesha',
        accountNumber: '001122',
        salaryRevisions: [{ id: 'revision-1' }],
      },
    },
    { includePayrollDetails: true }
  )

  assert.equal(employee.payrollProfile?.cnicNumber, '12345-1234567-1')
  assert.equal(employee.payrollProfile?.bankName, 'Bank')
  assert.equal(employee.payrollProfile?.accountNumber, '001122')
  assert.equal(employee.payrollProfile?.salaryRevisions?.length, 1)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isEligiblePayrollEmployee,
  isOffboardedPayrollEmployee,
  isStructurallyPayrollEligible,
  toPayrollEmployeeListItem,
} from '../lib/payroll/employee-eligibility'

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

test('offboarded cohort = structurally eligible AND deactivated', () => {
  const offboarded = {
    name: 'Departed Analyst',
    department: 'Product',
    position: 'Associate',
    payrollProfile: { isPayrollActive: false },
  }
  // Excluded from active, included in offboarded.
  assert.equal(isEligiblePayrollEmployee(offboarded), false)
  assert.equal(isOffboardedPayrollEmployee(offboarded), true)

  // Active employees are never in the offboarded cohort.
  const active = {
    name: 'Working Analyst',
    department: 'Product',
    position: 'Associate',
    payrollProfile: { isPayrollActive: true },
  }
  assert.equal(isOffboardedPayrollEmployee(active), false)

  // Missing flag defaults to active, not offboarded.
  const noFlag = { name: 'No Flag', department: 'Product', position: 'Associate' }
  assert.equal(isEligiblePayrollEmployee(noFlag), true)
  assert.equal(isOffboardedPayrollEmployee(noFlag), false)
})

test('structural carve-outs (3E, Noble, Partner) are excluded from BOTH cohorts even when deactivated', () => {
  const cases = [
    { name: 'Ex Partner', department: 'Executive', position: 'Partner', payrollProfile: { isPayrollActive: false } },
    { name: 'Ex 3E', department: '3E', position: 'Analyst', payrollProfile: { isPayrollActive: false } },
    {
      name: 'Ex Noble',
      department: 'Technology',
      position: 'Analyst',
      payrollProfile: { isPayrollActive: false, department: { name: 'Noble' } },
    },
  ]
  for (const c of cases) {
    assert.equal(isStructurallyPayrollEligible(c), false, `${c.name} should not be structurally eligible`)
    assert.equal(isEligiblePayrollEmployee(c), false, `${c.name} should not be active`)
    assert.equal(isOffboardedPayrollEmployee(c), false, `${c.name} should not be offboarded`)
  }
})

test('the two cohorts are mutually exclusive', () => {
  const users = [
    { name: 'A', department: 'Product', position: 'Associate', payrollProfile: { isPayrollActive: true } },
    { name: 'B', department: 'Product', position: 'Associate', payrollProfile: { isPayrollActive: false } },
    { name: 'C', department: 'Executive', position: 'Partner', payrollProfile: { isPayrollActive: true } },
  ]
  for (const u of users) {
    assert.equal(isEligiblePayrollEmployee(u) && isOffboardedPayrollEmployee(u), false, `${u.name} in both cohorts`)
  }
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

test('operational mode exposes logistics but never sensitive fields', () => {
  const employee = toPayrollEmployeeListItem(
    {
      id: 'u1',
      name: 'Ayesha',
      role: 'EMPLOYEE',
      department: 'Technology',
      position: 'Associate',
      payrollProfile: {
        isPayrollActive: true,
        designation: 'Backend Engineer',
        department: { name: 'Technology' },
        employmentType: { name: 'Full Time' },
        distanceKm: 12,
        transportMode: 'BIKE',
        cnicNumber: '12345-1234567-1',
        bankName: 'Bank',
        accountNumber: '001122',
        salaryRevisions: [{ id: 'revision-1' }],
      },
    },
    { includeOperational: true }
  )

  // Logistical fields are present...
  assert.equal(employee.payrollProfile?.distanceKm, 12)
  assert.equal(employee.payrollProfile?.transportMode, 'BIKE')
  // ...but sensitive fields are not even serialized.
  const profile = employee.payrollProfile as Record<string, unknown>
  assert.equal('cnicNumber' in profile, false)
  assert.equal('bankName' in profile, false)
  assert.equal('accountNumber' in profile, false)
  assert.equal('salaryRevisions' in profile, false)
})

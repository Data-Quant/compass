import test from 'node:test'
import assert from 'node:assert/strict'
import { receiptToPayslipData } from '../lib/payroll/payslip-data'
import { generatePayslipPdf } from '../lib/payroll/receipt-pdf'

const receiptJson = {
  earnings: {
    basicSalary: 270000,
    medicalTaxExemption: -27000,
    bonus: 0,
    medicalAllowance: 27000,
    travelReimbursement: 0,
    mobileReimbursement: 0,
    expenseReimbursement: 55505,
    advanceLoan: 0,
    additionalEarnings: 0,
    totalEarnings: 325505,
  },
  deductions: {
    incomeTax: 21600,
    adjustment: 0,
    loanRepayment: 0,
    additionalDeductions: 0,
    totalDeductions: 21600,
  },
  net: { netSalary: 303905, paid: 303905, balance: 0 },
}

test('receiptToPayslipData maps receipt json and profile into payslip data', () => {
  const data = receiptToPayslipData({
    receiptJson,
    payrollName: 'Ammar Hassan',
    periodLabel: 'August 2026',
    profile: {
      designation: 'Junior Partner - Quantitative Engineering',
      cnicNumber: '37405-8792843-1',
      accountNumber: '3077301000005413',
      departmentName: 'Quantitative Engineering',
      employmentTypeName: 'Permanent',
    },
  })

  assert.equal(data.employeeName, 'Ammar Hassan')
  assert.equal(data.periodLabel, 'August 2026')
  assert.equal(data.designation, 'Junior Partner - Quantitative Engineering')
  assert.equal(data.department, 'Quantitative Engineering')
  assert.equal(data.employmentStatus, 'Permanent')
  assert.equal(data.cnicNumber, '37405-8792843-1')
  assert.equal(data.accountNumber, '3077301000005413')
  assert.equal(data.earnings.basicSalary, 270000)
  assert.equal(data.earnings.totalTaxableSalary, 243000)
  assert.equal(data.earnings.totalEarnings, 325505)
  assert.equal(data.deductions.totalDeductions, 21600)
  assert.equal(data.net.netSalary, 303905)
})

test('receiptToPayslipData coerces missing or malformed numbers to zero', () => {
  const data = receiptToPayslipData({
    receiptJson: { earnings: { basicSalary: 'abc' }, net: {} },
    payrollName: 'Someone',
    periodLabel: 'Sep 2026',
    profile: null,
  })

  assert.equal(data.earnings.basicSalary, 0)
  assert.equal(data.earnings.totalTaxableSalary, 0)
  assert.equal(data.net.netSalary, 0)
  assert.equal(data.department, null)
  assert.equal(data.designation, null)
})

test('generatePayslipPdf renders a PDF document', async () => {
  const data = receiptToPayslipData({
    receiptJson,
    payrollName: 'Ammar Hassan',
    periodLabel: 'August 2026',
    profile: { designation: 'Engineer', cnicNumber: null, accountNumber: null, departmentName: null, employmentTypeName: null },
  })
  const pdf = await generatePayslipPdf(data)
  assert.ok(Buffer.isBuffer(pdf))
  assert.equal(pdf.subarray(0, 5).toString('utf8'), '%PDF-')
  assert.ok(pdf.length > 20000, `pdf too small: ${pdf.length}`)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEmployeePayrollHistory,
  type HistoryPeriodMeta,
} from '../lib/payroll/employee-history'

const periods: HistoryPeriodMeta[] = [
  { id: 'p-jun', label: 'June 2026', periodStart: new Date('2026-06-01T00:00:00.000Z'), status: 'APPROVED' },
  { id: 'p-may', label: 'May 2026', periodStart: new Date('2026-05-01T00:00:00.000Z'), status: 'SENT' },
  { id: 'p-empty', label: 'April 2026', periodStart: new Date('2026-04-01T00:00:00.000Z'), status: 'DRAFT' },
]

test('groups line items by period, labels and classifies them, and echoes totals', () => {
  const history = buildEmployeePayrollHistory({
    periods,
    inputRows: [
      { periodId: 'p-jun', componentKey: 'BASIC_SALARY', amount: 300000 },
      { periodId: 'p-jun', componentKey: 'MOBILE_REIMBURSEMENT', amount: 5000 },
      { periodId: 'p-jun', componentKey: 'INCOME_TAX', amount: 20000 },
      { periodId: 'p-jun', componentKey: 'PAID', amount: 285000 }, // non-line-item, excluded
      { periodId: 'p-jun', componentKey: 'BONUS', amount: 0 }, // zero, hidden
    ],
    computedRows: [
      { periodId: 'p-jun', metricKey: 'TOTAL_EARNINGS', amount: 305000 },
      { periodId: 'p-jun', metricKey: 'TOTAL_DEDUCTIONS', amount: 20000 },
      { periodId: 'p-jun', metricKey: 'NET_SALARY', amount: 285000 },
    ],
    receipts: [],
  })

  const june = history.find((h) => h.periodId === 'p-jun')!
  assert.ok(june)
  // PAID and the zero BONUS are excluded; salary, mobile, tax remain.
  assert.deepEqual(
    june.lineItems.map((l) => l.key),
    ['BASIC_SALARY', 'MOBILE_REIMBURSEMENT', 'INCOME_TAX']
  )
  assert.equal(june.lineItems[0].label, 'Basic Salary')
  assert.equal(june.lineItems[1].label, 'Mobile Allowance')
  assert.equal(june.lineItems.find((l) => l.key === 'INCOME_TAX')!.kind, 'DEDUCTION')
  assert.equal(june.lineItems.find((l) => l.key === 'BASIC_SALARY')!.kind, 'EARNING')
  assert.deepEqual(june.totals, { totalEarnings: 305000, totalDeductions: 20000, netSalary: 285000 })
})

test('sorts periods newest-first and skips periods with no data for the employee', () => {
  const history = buildEmployeePayrollHistory({
    periods,
    inputRows: [
      { periodId: 'p-may', componentKey: 'BASIC_SALARY', amount: 250000 },
      { periodId: 'p-jun', componentKey: 'BASIC_SALARY', amount: 300000 },
    ],
    computedRows: [],
    receipts: [],
  })

  // p-empty has no rows and is dropped; June before May.
  assert.deepEqual(history.map((h) => h.periodId), ['p-jun', 'p-may'])
})

test('classifies ADJUSTMENT by sign', () => {
  const history = buildEmployeePayrollHistory({
    periods: [periods[0]],
    inputRows: [
      { periodId: 'p-jun', componentKey: 'ADJUSTMENT', amount: -1500 },
    ],
    computedRows: [],
    receipts: [],
  })
  assert.equal(history[0].lineItems[0].kind, 'DEDUCTION')

  const refund = buildEmployeePayrollHistory({
    periods: [periods[0]],
    inputRows: [{ periodId: 'p-jun', componentKey: 'ADJUSTMENT', amount: 1500 }],
    computedRows: [],
    receipts: [],
  })
  assert.equal(refund[0].lineItems[0].kind, 'EARNING')
})

test('attaches receipts and is tolerant of missing computed rows', () => {
  const history = buildEmployeePayrollHistory({
    periods,
    inputRows: [{ periodId: 'p-jun', componentKey: 'BASIC_SALARY', amount: 300000 }],
    computedRows: [], // no computed rows at all
    receipts: [
      { periodId: 'p-jun', id: 'r1', status: 'SIGNED', receiptJson: { net: { netSalary: 280000 } } },
    ],
  })
  const june = history[0]
  // Missing computed rows default to zero, not a crash.
  assert.deepEqual(june.totals, { totalEarnings: 0, totalDeductions: 0, netSalary: 0 })
  assert.equal(june.receipt?.id, 'r1')
  assert.equal(june.receipt?.status, 'SIGNED')
  assert.deepEqual(june.receipt?.receiptJson, { net: { netSalary: 280000 } })
})

test('includes a period that has only a receipt (no input/computed rows)', () => {
  const history = buildEmployeePayrollHistory({
    periods,
    inputRows: [],
    computedRows: [],
    receipts: [{ periodId: 'p-may', id: 'r2', status: 'DRAFT', receiptJson: null }],
  })
  assert.equal(history.length, 1)
  assert.equal(history[0].periodId, 'p-may')
  assert.deepEqual(history[0].lineItems, [])
  assert.equal(history[0].receipt?.id, 'r2')
})

// Pure assembly of a single employee's month-by-month payroll history. Kept free
// of DB/Prisma imports so the grouping/labelling/sorting can be unit-tested in
// isolation. The API route fetches the raw rows and hands them here.

import {
  NON_LINE_ITEM_KEYS,
  payrollComponentKind,
  payrollComponentLabel,
  payrollComponentOrder,
  type PayrollLineKind,
} from './component-labels'

export interface HistoryInputRow {
  periodId: string
  componentKey: string
  amount: number
}

export interface HistoryComputedRow {
  periodId: string
  metricKey: string
  amount: number
}

export interface HistoryReceiptRow {
  periodId: string
  id: string
  status: string
  receiptJson?: unknown
}

export interface HistoryPeriodMeta {
  id: string
  label: string
  periodStart: Date
  status: string
}

export interface PayrollHistoryLineItem {
  key: string
  label: string
  amount: number
  kind: PayrollLineKind
}

export interface PayrollHistoryTotals {
  totalEarnings: number
  totalDeductions: number
  netSalary: number
}

export interface PayrollHistoryReceiptRef {
  id: string
  status: string
  receiptJson: unknown
}

export interface PayrollHistoryPeriod {
  periodId: string
  periodLabel: string
  periodStart: string // ISO
  periodStatus: string
  lineItems: PayrollHistoryLineItem[]
  totals: PayrollHistoryTotals
  receipt: PayrollHistoryReceiptRef | null
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const k = key(row)
    const list = map.get(k)
    if (list) list.push(row)
    else map.set(k, [row])
  }
  return map
}

// Assemble the employee's history, newest period first. A period is included
// only when the employee has at least one input row, computed row, or receipt
// in it. Zero-amount line items are hidden to keep each month's breakdown clean;
// the period is still shown (with its totals) as long as it has any data.
export function buildEmployeePayrollHistory(params: {
  periods: HistoryPeriodMeta[]
  inputRows: HistoryInputRow[]
  computedRows: HistoryComputedRow[]
  receipts: HistoryReceiptRow[]
}): PayrollHistoryPeriod[] {
  const { periods, inputRows, computedRows, receipts } = params

  const inputsByPeriod = groupBy(inputRows, (r) => r.periodId)
  const computedByPeriod = groupBy(computedRows, (r) => r.periodId)
  const receiptByPeriod = new Map(receipts.map((r) => [r.periodId, r]))

  const result: PayrollHistoryPeriod[] = []

  for (const period of periods) {
    const periodInputs = inputsByPeriod.get(period.id) || []
    const periodComputed = computedByPeriod.get(period.id) || []
    const receipt = receiptByPeriod.get(period.id) || null

    if (periodInputs.length === 0 && periodComputed.length === 0 && !receipt) continue

    const lineItems: PayrollHistoryLineItem[] = periodInputs
      .filter((row) => !NON_LINE_ITEM_KEYS.has(row.componentKey))
      .filter((row) => row.amount !== 0)
      .map((row) => ({
        key: row.componentKey,
        label: payrollComponentLabel(row.componentKey),
        amount: row.amount,
        kind: payrollComponentKind(row.componentKey, row.amount),
      }))
      .sort((a, b) => payrollComponentOrder(a.key) - payrollComponentOrder(b.key))

    const metric = (key: string) => periodComputed.find((r) => r.metricKey === key)?.amount ?? 0

    result.push({
      periodId: period.id,
      periodLabel: period.label,
      periodStart: period.periodStart.toISOString(),
      periodStatus: period.status,
      lineItems,
      totals: {
        totalEarnings: metric('TOTAL_EARNINGS'),
        totalDeductions: metric('TOTAL_DEDUCTIONS'),
        netSalary: metric('NET_SALARY'),
      },
      receipt: receipt
        ? { id: receipt.id, status: receipt.status, receiptJson: receipt.receiptJson ?? null }
        : null,
    })
  }

  return result.sort(
    (a, b) => new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime()
  )
}

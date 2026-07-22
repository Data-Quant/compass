// Single source of truth for how payroll input components are labelled and
// classified (earning vs deduction). The pay stub and the employee payroll
// history both render from these so they never drift apart. Labels mirror the
// wording used on the existing pay stub (components/payroll/PayrollPayStub.tsx).

import { PAYROLL_COMPONENT_KEYS, type PayrollComponentKey } from './config'

export const PAYROLL_COMPONENT_LABELS: Record<PayrollComponentKey, string> = {
  BASIC_SALARY: 'Basic Salary',
  MEDICAL_TAX_EXEMPTION: 'Tax Exemption on Medical (10%)',
  BONUS: 'Bonus',
  MEDICAL_ALLOWANCE: 'Medical Allowance',
  TRAVEL_REIMBURSEMENT: 'Travel Reimbursement',
  MOBILE_REIMBURSEMENT: 'Mobile Allowance',
  EXPENSE_REIMBURSEMENT: 'Reimbursements (Personal/Office)',
  ADVANCE_LOAN: 'Advance Salary (Loan)',
  INCOME_TAX: 'Income Tax',
  ADJUSTMENT: 'Adjustment (+Refund/-Deduction)',
  LOAN_REPAYMENT: 'Loan Repayments',
  PAID: 'Paid',
}

export type PayrollLineKind = 'EARNING' | 'DEDUCTION'

// Components that always reduce net pay.
const DEDUCTION_KEYS: ReadonlySet<string> = new Set(['INCOME_TAX', 'LOAN_REPAYMENT'])

// Components that are not per-line earnings/deductions. PAID is the amount
// actually disbursed (part of the net section), not a category of pay.
export const NON_LINE_ITEM_KEYS: ReadonlySet<string> = new Set(['PAID'])

// Canonical display order, matching the order components appear on the pay stub.
const KEY_ORDER = new Map<string, number>(PAYROLL_COMPONENT_KEYS.map((key, index) => [key, index]))

export function payrollComponentLabel(key: string): string {
  return PAYROLL_COMPONENT_LABELS[key as PayrollComponentKey] ?? titleCaseKey(key)
}

// ADJUSTMENT can be a refund (earning) or a deduction depending on its sign;
// everything else has a fixed kind. ADVANCE_LOAN is an earning (advance paid to
// the employee), matching the pay stub's grouping.
export function payrollComponentKind(key: string, amount: number): PayrollLineKind {
  if (DEDUCTION_KEYS.has(key)) return 'DEDUCTION'
  if (key === 'ADJUSTMENT') return amount < 0 ? 'DEDUCTION' : 'EARNING'
  return 'EARNING'
}

export function payrollComponentOrder(key: string): number {
  return KEY_ORDER.get(key) ?? Number.MAX_SAFE_INTEGER
}

function titleCaseKey(key: string): string {
  return key
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

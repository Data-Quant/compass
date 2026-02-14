import { PayrollComponentKey } from '@/lib/payroll/config'

export const ACTIVE_EDITABLE_SHEETS = [
  'Final Payments',
  'Payment Receipt',
  'Petty Cash Summary',
  'Petty Cash',
  'Reimbursements (Approved)',
  'Reimbursements',
  'Basic Salaries',
  'Gross Salaries',
  'Medical',
  'Salaries',
  'Utility Bills',
  'Meals',
  'Mobile',
  'Travel',
  'Interns',
  'Bonus',
  'Loan',
  'Loan Deduct',
  'WHT Calculations',
  'WHT Reconciliation',
  'Deductions',
  'Bonuses',
  'Tax Slab',
  'Updated Tax Slabs',
  'Banking Details',
  'Salary Payments',
  'Weekly Timesheet',
  'Time Sheet',
] as const

export const READ_ONLY_HISTORY_SHEETS = [
  'Petty Cash - Old',
  'Petty Cash OLD',
  'Reimbursements OLD',
  'Tax Slabs old',
  '2023 Tax slabs',
  'Form Responses 11',
  'Form Responses 6',
  'Jan payment',
  'Sheet2',
] as const

export const SHEET_TO_COMPONENT_KEY: Partial<Record<string, PayrollComponentKey>> = {
  Salaries: 'BASIC_SALARY',
  'Basic Salaries': 'BASIC_SALARY',
  Medical: 'MEDICAL_ALLOWANCE',
  Bonus: 'BONUS',
  Bonuses: 'BONUS',
  Travel: 'TRAVEL_REIMBURSEMENT',
  'Utility Bills': 'UTILITY_REIMBURSEMENT',
  Meals: 'MEALS_REIMBURSEMENT',
  Mobile: 'MOBILE_REIMBURSEMENT',
  Loan: 'ADVANCE_LOAN',
  'Loan Deduct': 'LOAN_REPAYMENT',
  Deductions: 'ADJUSTMENT',
  'Final Payments': 'PAID',
  Interns: 'BASIC_SALARY',
}

export const EXPENSE_SHEETS = new Set([
  'Reimbursements (Approved)',
  'Reimbursements',
  'Petty Cash',
  'Petty Cash Summary',
  'Petty Cash - Old',
  'Petty Cash OLD',
])

export const SHEET_PRIORITY: Record<string, number> = {
  Salaries: 100,
  'Basic Salaries': 90,
  Medical: 100,
  Bonus: 100,
  Bonuses: 95,
  Travel: 100,
  'Utility Bills': 100,
  Meals: 100,
  Mobile: 100,
  Loan: 100,
  'Loan Deduct': 100,
  Deductions: 100,
  'Final Payments': 100,
  Interns: 80,
}

export function isActiveEditableSheet(sheetName: string): boolean {
  return ACTIVE_EDITABLE_SHEETS.includes(sheetName as (typeof ACTIVE_EDITABLE_SHEETS)[number])
}

export function isReadOnlyHistorySheet(sheetName: string): boolean {
  return READ_ONLY_HISTORY_SHEETS.includes(sheetName as (typeof READ_ONLY_HISTORY_SHEETS)[number])
}

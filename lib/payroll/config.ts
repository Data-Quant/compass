export const PAYROLL_DEFAULT_CURRENCY = 'PKR'
export const PAYROLL_DEFAULT_TIMEZONE = 'Asia/Karachi'

export const PAYROLL_COMPONENT_KEYS = [
  'BASIC_SALARY',
  'MEDICAL_TAX_EXEMPTION',
  'BONUS',
  'MEDICAL_ALLOWANCE',
  'TRAVEL_REIMBURSEMENT',
  'MOBILE_REIMBURSEMENT',
  'EXPENSE_REIMBURSEMENT',
  'ADVANCE_LOAN',
  'INCOME_TAX',
  'ADJUSTMENT',
  'LOAN_REPAYMENT',
  'PAID',
] as const

export const PAYROLL_METRIC_KEYS = [
  'TOTAL_TAXABLE_SALARY',
  'TOTAL_EARNINGS',
  'TOTAL_DEDUCTIONS',
  'NET_SALARY',
  'BALANCE',
] as const

export type PayrollComponentKey = (typeof PAYROLL_COMPONENT_KEYS)[number]
export type PayrollMetricKey = (typeof PAYROLL_METRIC_KEYS)[number]

/* ---------- Pay slip email runtime config ---------- */

export interface PayslipMailRuntimeConfig {
  sender: string
  missing: string[]
  ready: boolean
}

/**
 * Pay slips go out through the same Gmail transport as evaluation reports.
 * Reports which credentials are absent so the UI can warn before a send run.
 */
export function getPayslipMailRuntimeConfig(): PayslipMailRuntimeConfig {
  const sender = process.env.GMAIL_USER || ''
  const appPassword = process.env.GMAIL_APP_PASSWORD || ''

  const missing = [
    !sender ? 'GMAIL_USER' : '',
    !appPassword ? 'GMAIL_APP_PASSWORD' : '',
  ].filter(Boolean)

  return { sender, missing, ready: missing.length === 0 }
}

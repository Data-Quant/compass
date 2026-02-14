export const PAYROLL_DEFAULT_CURRENCY = 'PKR'
export const PAYROLL_DEFAULT_TIMEZONE = 'Asia/Karachi'

export const PAYROLL_COMPONENT_KEYS = [
  'BASIC_SALARY',
  'MEDICAL_TAX_EXEMPTION',
  'BONUS',
  'MEDICAL_ALLOWANCE',
  'TRAVEL_REIMBURSEMENT',
  'UTILITY_REIMBURSEMENT',
  'MEALS_REIMBURSEMENT',
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

export interface DocuSignRuntimeConfig {
  integrationKey: string
  userId: string
  accountId: string
  privateKey: string
  oauthBasePath: string
  basePath: string
  missing: string[]
  ready: boolean
}

export function getDocuSignRuntimeConfig(): DocuSignRuntimeConfig {
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY || ''
  const userId = process.env.DOCUSIGN_USER_ID || ''
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID || ''
  const privateKey = process.env.DOCUSIGN_PRIVATE_KEY || ''
  const oauthBasePath = process.env.DOCUSIGN_OAUTH_BASE_PATH || 'account-d.docusign.com'
  const basePath = process.env.DOCUSIGN_BASE_PATH || 'https://demo.docusign.net'

  const missing = [
    !integrationKey ? 'DOCUSIGN_INTEGRATION_KEY' : '',
    !userId ? 'DOCUSIGN_USER_ID' : '',
    !accountId ? 'DOCUSIGN_ACCOUNT_ID' : '',
    !privateKey ? 'DOCUSIGN_PRIVATE_KEY' : '',
  ].filter(Boolean)

  return {
    integrationKey,
    userId,
    accountId,
    privateKey,
    oauthBasePath,
    basePath,
    missing,
    ready: missing.length === 0,
  }
}

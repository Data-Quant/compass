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

/* ---------- HelloSign (Dropbox Sign) runtime config ---------- */

export interface HelloSignRuntimeConfig {
  apiKey: string
  clientId: string
  testMode: boolean
  webhookSecret: string
  missing: string[]
  ready: boolean
}

export function getHelloSignRuntimeConfig(): HelloSignRuntimeConfig {
  const apiKey = process.env.HELLOSIGN_API_KEY || ''
  const clientId = process.env.HELLOSIGN_CLIENT_ID || ''
  const testMode = process.env.HELLOSIGN_TEST_MODE === '1' || process.env.HELLOSIGN_TEST_MODE === 'true'
  const webhookSecret = process.env.HELLOSIGN_WEBHOOK_SECRET || ''

  const missing = [
    !apiKey ? 'HELLOSIGN_API_KEY' : '',
  ].filter(Boolean)

  return {
    apiKey,
    clientId,
    testMode,
    webhookSecret,
    missing,
    ready: missing.length === 0,
  }
}

/* ---------- Legacy DocuSign runtime config (deprecated) ---------- */

/** @deprecated Use getHelloSignRuntimeConfig() instead */
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

/** @deprecated Use getHelloSignRuntimeConfig() instead */
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

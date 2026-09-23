/**
 * Maps a stored payroll receipt (receiptJson + employee profile) into the
 * flat, fully-numeric shape the pay slip PDF renders. Pure: no I/O.
 */

export interface PayslipProfileInput {
  designation?: string | null
  cnicNumber?: string | null
  accountNumber?: string | null
  departmentName?: string | null
  employmentTypeName?: string | null
}

export interface PayslipEarnings {
  basicSalary: number
  medicalTaxExemption: number
  bonus: number
  totalTaxableSalary: number
  medicalAllowance: number
  travelReimbursement: number
  mobileReimbursement: number
  expenseReimbursement: number
  advanceLoan: number
  additionalEarnings: number
  totalEarnings: number
}

export interface PayslipDeductions {
  incomeTax: number
  adjustment: number
  loanRepayment: number
  additionalDeductions: number
  totalDeductions: number
}

export interface PayslipNet {
  netSalary: number
  paid: number
  balance: number
}

export interface PayslipData {
  employeeName: string
  periodLabel: string
  designation: string | null
  department: string | null
  employmentStatus: string | null
  cnicNumber: string | null
  accountNumber: string | null
  earnings: PayslipEarnings
  deductions: PayslipDeductions
  net: PayslipNet
}

export interface ReceiptToPayslipInput {
  receiptJson: unknown
  payrollName: string
  periodLabel: string
  profile: PayslipProfileInput | null | undefined
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function str(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function section(json: unknown, key: string): Record<string, unknown> {
  if (!json || typeof json !== 'object') return {}
  const value = (json as Record<string, unknown>)[key]
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export function receiptToPayslipData(input: ReceiptToPayslipInput): PayslipData {
  const earnings = section(input.receiptJson, 'earnings')
  const deductions = section(input.receiptJson, 'deductions')
  const net = section(input.receiptJson, 'net')

  const basicSalary = num(earnings.basicSalary)
  const medicalTaxExemption = num(earnings.medicalTaxExemption)
  const profile = input.profile ?? {}

  return {
    employeeName: input.payrollName,
    periodLabel: input.periodLabel,
    designation: str(profile.designation),
    department: str(profile.departmentName),
    employmentStatus: str(profile.employmentTypeName),
    cnicNumber: str(profile.cnicNumber),
    accountNumber: str(profile.accountNumber),
    earnings: {
      basicSalary,
      medicalTaxExemption,
      bonus: num(earnings.bonus),
      // Bonus is non-taxable and excluded from this subtotal.
      totalTaxableSalary: basicSalary + medicalTaxExemption,
      medicalAllowance: num(earnings.medicalAllowance),
      travelReimbursement: num(earnings.travelReimbursement),
      mobileReimbursement: num(earnings.mobileReimbursement),
      expenseReimbursement: num(earnings.expenseReimbursement),
      advanceLoan: num(earnings.advanceLoan),
      additionalEarnings: num(earnings.additionalEarnings),
      totalEarnings: num(earnings.totalEarnings),
    },
    deductions: {
      incomeTax: num(deductions.incomeTax),
      adjustment: num(deductions.adjustment),
      loanRepayment: num(deductions.loanRepayment),
      additionalDeductions: num(deductions.additionalDeductions),
      totalDeductions: num(deductions.totalDeductions),
    },
    net: {
      netSalary: num(net.netSalary),
      paid: num(net.paid),
      balance: num(net.balance),
    },
  }
}

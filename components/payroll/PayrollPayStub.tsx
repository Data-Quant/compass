'use client'

import { Separator } from '@/components/ui/separator'

interface ReceiptJson {
  periodKey?: string
  payrollName?: string
  earnings?: {
    basicSalary?: number
    medicalTaxExemption?: number
    bonus?: number
    medicalAllowance?: number
    travelReimbursement?: number
    utilityReimbursement?: number
    mealsReimbursement?: number
    mobileReimbursement?: number
    expenseReimbursement?: number
    advanceLoan?: number
    totalEarnings?: number
  }
  deductions?: {
    incomeTax?: number
    adjustment?: number
    loanRepayment?: number
    totalDeductions?: number
  }
  net?: {
    netSalary?: number
    paid?: number
    previousBalance?: number
    balance?: number
  }
}

interface PayrollPayStubProps {
  payrollName: string
  periodLabel: string
  receiptJson: ReceiptJson | null
  recipientName?: string
  recipientEmail?: string
}

function num(v: unknown) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function money(v: number) {
  return `PKR ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function StubRow({ label, amount, bold, indent }: { label: string; amount: number; bold?: boolean; indent?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${indent ? 'pl-4' : ''} ${bold ? 'font-semibold' : ''}`}>
      <span className={`text-sm ${bold ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
      <span className={`text-sm tabular-nums ${bold ? 'text-foreground' : ''}`}>{money(amount)}</span>
    </div>
  )
}

export function PayrollPayStub({
  payrollName,
  periodLabel,
  receiptJson,
  recipientName,
  recipientEmail,
}: PayrollPayStubProps) {
  const earnings = receiptJson?.earnings || {}
  const deductions = receiptJson?.deductions || {}
  const net = receiptJson?.net || {}

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold font-display">{payrollName}</h3>
          {recipientName && recipientName !== payrollName && (
            <p className="text-sm text-muted-foreground">{recipientName}</p>
          )}
          {recipientEmail && (
            <p className="text-xs text-muted-foreground">{recipientEmail}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Pay Period</p>
          <p className="text-sm font-medium">{periodLabel}</p>
        </div>
      </div>

      <Separator />

      {/* Earnings */}
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-2">Earnings</p>
        <StubRow label="Basic Salary" amount={num(earnings.basicSalary)} indent />
        <StubRow label="Tax Exemption on Medical (10%)" amount={num(earnings.medicalTaxExemption)} indent />
        <StubRow label="Bonus" amount={num(earnings.bonus)} indent />
        <Separator className="my-1.5" />
        <StubRow
          label="Total Taxable Salary"
          amount={num(earnings.basicSalary) + num(earnings.medicalTaxExemption) + num(earnings.bonus)}
          bold
        />
        <div className="h-2" />
        <StubRow label="Medical Allowance" amount={num(earnings.medicalAllowance)} indent />
        <StubRow label="Travel Reimbursement" amount={num(earnings.travelReimbursement)} indent />
        <StubRow label="Utility Bills Reimbursement" amount={num(earnings.utilityReimbursement)} indent />
        <StubRow label="Meals & Entertainment" amount={num(earnings.mealsReimbursement)} indent />
        <StubRow label="Mobile Internet" amount={num(earnings.mobileReimbursement)} indent />
        <StubRow label="Reimbursements (Personal/Office)" amount={num(earnings.expenseReimbursement)} indent />
        <StubRow label="Advance Salary (Loan)" amount={num(earnings.advanceLoan)} indent />
        <Separator className="my-1.5" />
        <StubRow label="Total Earnings" amount={num(earnings.totalEarnings)} bold />
      </div>

      <Separator />

      {/* Deductions */}
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-2">Deductions</p>
        <StubRow label="Income Tax" amount={num(deductions.incomeTax)} indent />
        <StubRow label="Adjustment (+Refund/-Deduction)" amount={num(deductions.adjustment)} indent />
        <StubRow label="Loan Repayments" amount={num(deductions.loanRepayment)} indent />
        <Separator className="my-1.5" />
        <StubRow label="Total Deductions" amount={num(deductions.totalDeductions)} bold />
      </div>

      <Separator />

      {/* Net */}
      <div>
        <div className="flex items-center justify-between py-2">
          <span className="text-base font-semibold font-display">Net Salary</span>
          <span className="text-lg font-bold tabular-nums text-primary">{money(num(net.netSalary))}</span>
        </div>
        <StubRow label="Paid" amount={num(net.paid)} indent />
        <StubRow label="Previous Balance" amount={num(net.previousBalance)} indent />
        <Separator className="my-1.5" />
        <div className="flex items-center justify-between py-2">
          <span className="text-base font-semibold">Balance</span>
          <span className="text-base font-bold tabular-nums">{money(num(net.balance))}</span>
        </div>
      </div>
    </div>
  )
}

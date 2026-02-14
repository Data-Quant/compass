'use client'

import { PayrollPeriodsWorkspace } from '@/components/payroll/PayrollPeriodsWorkspace'

export default function OaPayrollPage() {
  return (
    <PayrollPeriodsWorkspace
      appBasePath="/oa"
      badge="O&A Payroll"
      heading="Payroll"
      description="Default monthly workflow: carry-forward from prior period, apply changes, recalculate, approve, and send DocuSign receipts."
    />
  )
}

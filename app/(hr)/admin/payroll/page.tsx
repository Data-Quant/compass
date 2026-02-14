'use client'

import { PayrollPeriodsWorkspace } from '@/components/payroll/PayrollPeriodsWorkspace'

export default function AdminPayrollPage() {
  return (
    <PayrollPeriodsWorkspace
      appBasePath="/admin"
      badge="Admin Payroll"
      heading="Payroll Automation"
      description="Manage payroll periods, workbook imports, reconciliation, approvals, and DocuSign delivery."
    />
  )
}

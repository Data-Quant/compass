'use client'

import { useParams } from 'next/navigation'
import { PayrollPeriodDetailWorkspace } from '@/components/payroll/PayrollPeriodDetailWorkspace'

export default function AdminPayrollPeriodDetailPage() {
  const params = useParams<{ periodId: string }>()
  const periodId = typeof params?.periodId === 'string' ? params.periodId : ''

  return <PayrollPeriodDetailWorkspace appBasePath="/admin" periodId={periodId} badge="Admin Payroll" />
}

'use client'

import { useParams } from 'next/navigation'
import { PayrollPeriodDetailWorkspace } from '@/components/payroll/PayrollPeriodDetailWorkspace'

export default function OaPayrollPeriodDetailPage() {
  const params = useParams<{ periodId: string }>()
  const periodId = typeof params?.periodId === 'string' ? params.periodId : ''

  return <PayrollPeriodDetailWorkspace appBasePath="/oa" periodId={periodId} badge="O&A Payroll" />
}

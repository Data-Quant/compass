'use client'

import { PayrollDashboard } from '@/components/payroll/PayrollDashboard'

interface WorkspaceProps {
  appBasePath: '/oa' | '/admin'
  badge: string
  heading: string
  description: string
}

export function PayrollPeriodsWorkspace(props: WorkspaceProps) {
  return <PayrollDashboard {...props} />
}

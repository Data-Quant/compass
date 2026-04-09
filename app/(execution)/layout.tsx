'use client'

import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { EMPLOYEE_SIDEBAR, ONBOARDING_SIDEBAR } from '@/components/layout/AppSidebar'

export default function ExecutionLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout
      sidebarConfig={EMPLOYEE_SIDEBAR}
      onboardingSidebarConfig={ONBOARDING_SIDEBAR}
      requiredRole="EXECUTION"
    >
      {children}
    </SidebarLayout>
  )
}

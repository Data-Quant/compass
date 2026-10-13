'use client'

import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { EMPLOYEE_SIDEBAR, ONBOARDING_SIDEBAR, SECURITY_SIDEBAR } from '@/components/layout/AppSidebar'

// Shared by employees (their own checks) and the Security / Console Admin
// console, so Security Admins keep their own sidebar here.
export default function SecurityChecksLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout sidebarConfig={EMPLOYEE_SIDEBAR} onboardingSidebarConfig={ONBOARDING_SIDEBAR} sidebarConfigByRole={{ SECURITY: SECURITY_SIDEBAR }}>
      {children}
    </SidebarLayout>
  )
}

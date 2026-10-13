'use client'

import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { ADMIN_SIDEBAR, EMPLOYEE_SIDEBAR, ONBOARDING_SIDEBAR, SECURITY_SIDEBAR } from '@/components/layout/AppSidebar'

// Shared by employees (their own checks) and the Security / Console Admin
// console, so Security Admins and HR keep their own console sidebars here.
export default function SecurityChecksLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout sidebarConfig={EMPLOYEE_SIDEBAR} onboardingSidebarConfig={ONBOARDING_SIDEBAR} sidebarConfigByRole={{ SECURITY: SECURITY_SIDEBAR, HR: ADMIN_SIDEBAR }}>
      {children}
    </SidebarLayout>
  )
}

'use client'

import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { EMPLOYEE_SIDEBAR } from '@/components/layout/AppSidebar'

export default function SecurityLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout sidebarConfig={EMPLOYEE_SIDEBAR}>
      {children}
    </SidebarLayout>
  )
}

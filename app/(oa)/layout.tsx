'use client'

import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { EMPLOYEE_SIDEBAR } from '@/components/layout/AppSidebar'

export default function OALayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout sidebarConfig={EMPLOYEE_SIDEBAR} requiredRole={['HR', 'OA']}>
      {children}
    </SidebarLayout>
  )
}

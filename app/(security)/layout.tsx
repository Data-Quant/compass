'use client'

import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { SECURITY_SIDEBAR } from '@/components/layout/AppSidebar'

export default function SecurityLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout sidebarConfig={SECURITY_SIDEBAR} requiredRole={['SECURITY', 'HR']}>
      {children}
    </SidebarLayout>
  )
}

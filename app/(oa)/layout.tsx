'use client'

import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { ADMIN_SIDEBAR } from '@/components/layout/AppSidebar'

export default function OALayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout sidebarConfig={ADMIN_SIDEBAR} requiredRole={['HR', 'ADMIN']}>
      {children}
    </SidebarLayout>
  )
}

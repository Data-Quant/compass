'use client'

import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { EXECUTION_SIDEBAR } from '@/components/layout/AppSidebar'

export default function ExecutionLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout sidebarConfig={EXECUTION_SIDEBAR} requiredRole={['EXECUTION', 'HR']}>
      {children}
    </SidebarLayout>
  )
}

import { notFound } from 'next/navigation'
import { DepartmentSetterWorkspace } from '@/components/kpi/DepartmentSetterWorkspace'
import { isKpiEnabled } from '@/lib/kpi/flag'

export const dynamic = 'force-dynamic'

export default function DepartmentKpisPage() {
  if (!isKpiEnabled()) notFound()
  return <DepartmentSetterWorkspace />
}

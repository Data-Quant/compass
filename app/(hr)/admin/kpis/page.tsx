import { notFound } from 'next/navigation'
import { AdminKpisWorkspace } from '@/components/kpi/admin/AdminKpisWorkspace'
import { isKpiEnabled } from '@/lib/kpi/flag'

export const dynamic = 'force-dynamic'

export default function AdminKpisPage() {
  if (!isKpiEnabled()) notFound()
  return <AdminKpisWorkspace />
}

import { notFound } from 'next/navigation'
import { AdminWeeklyWorkspace } from '@/components/weekly/admin/AdminWeeklyWorkspace'
import { isWeeklyEnabled } from '@/lib/weekly/flag'

export const dynamic = 'force-dynamic'

export default function AdminWeeklyPage() {
  if (!isWeeklyEnabled()) notFound()
  return <AdminWeeklyWorkspace />
}

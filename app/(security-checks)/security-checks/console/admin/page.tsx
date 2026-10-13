import { notFound } from 'next/navigation'
import { AdminPanel } from '@/components/security-checks/console/AdminPanel'
import { isSecurityChecksEnabled } from '@/lib/security-checks/flag'

export const dynamic = 'force-dynamic'

export default function SecurityChecksAdminPage() {
  if (!isSecurityChecksEnabled()) notFound()
  return <AdminPanel />
}

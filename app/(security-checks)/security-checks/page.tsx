import { notFound } from 'next/navigation'
import { MyChecksWorkspace } from '@/components/security-checks/MyChecksWorkspace'
import { isSecurityChecksEnabled } from '@/lib/security-checks/flag'

export const dynamic = 'force-dynamic'

export default function SecurityChecksPage() {
  if (!isSecurityChecksEnabled()) notFound()
  return <MyChecksWorkspace />
}

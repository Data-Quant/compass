import { notFound } from 'next/navigation'
import { ConsoleHome } from '@/components/security-checks/console/ConsoleHome'
import { isSecurityChecksEnabled } from '@/lib/security-checks/flag'

export const dynamic = 'force-dynamic'

export default function SecurityConsolePage() {
  if (!isSecurityChecksEnabled()) notFound()
  return <ConsoleHome />
}

import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { SecurityHub } from '@/components/security-checks/SecurityHub'
import { isSecurityChecksEnabled } from '@/lib/security-checks/flag'

export const dynamic = 'force-dynamic'

export default function SecurityPage() {
  if (!isSecurityChecksEnabled()) notFound()
  return (
    <Suspense fallback={<LoadingScreen message="Loading Security..." />}>
      <SecurityHub />
    </Suspense>
  )
}

import { notFound } from 'next/navigation'
import { ReviewQueue } from '@/components/security-checks/console/ReviewQueue'
import { isSecurityChecksEnabled } from '@/lib/security-checks/flag'

export const dynamic = 'force-dynamic'

export default function ReviewQueuePage() {
  if (!isSecurityChecksEnabled()) notFound()
  return <ReviewQueue />
}

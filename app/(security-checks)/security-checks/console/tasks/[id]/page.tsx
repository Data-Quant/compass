import { notFound } from 'next/navigation'
import { ReviewTask } from '@/components/security-checks/console/ReviewTask'
import { isSecurityChecksEnabled } from '@/lib/security-checks/flag'

export const dynamic = 'force-dynamic'

export default async function ReviewTaskPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSecurityChecksEnabled()) notFound()
  const { id } = await params
  return <ReviewTask taskId={id} />
}

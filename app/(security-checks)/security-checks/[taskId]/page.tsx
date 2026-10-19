import { notFound } from 'next/navigation'
import { TaskWorkspace } from '@/components/security-checks/TaskWorkspace'
import { isSecurityChecksEnabled } from '@/lib/security-checks/flag'

export const dynamic = 'force-dynamic'

export default async function SecurityCheckTaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  if (!isSecurityChecksEnabled()) notFound()
  const { taskId } = await params
  return <TaskWorkspace taskId={taskId} />
}

import { Badge } from '@/components/ui/badge'
import { TASK_STATUS_LABELS, type SubtaskStatus, type TaskStatus } from '@/lib/security-checks/types'

type Variant = 'default' | 'secondary' | 'destructive' | 'outline'

const TASK_VARIANT: Record<TaskStatus, Variant> = {
  NOT_STARTED: 'outline',
  IN_PROGRESS: 'outline',
  PENDING_REVIEW: 'secondary',
  REQUIRES_INFO: 'destructive',
  REJECTED: 'destructive',
  VERIFIED: 'default',
  EXPIRED: 'destructive',
  NOT_APPLICABLE: 'secondary',
  CANCELLED: 'outline',
  EXEMPT: 'secondary',
}

const SUBTASK_LABEL: Record<SubtaskStatus, string> = {
  OPEN: 'Open',
  PENDING_REVIEW: 'Pending review',
  REQUIRES_INFO: 'More info needed',
  REJECTED: 'Rejected',
  VERIFIED: 'Verified',
  NOT_APPLICABLE: 'Not applicable',
}

const SUBTASK_VARIANT: Record<SubtaskStatus, Variant> = {
  OPEN: 'outline',
  PENDING_REVIEW: 'secondary',
  REQUIRES_INFO: 'destructive',
  REJECTED: 'destructive',
  VERIFIED: 'default',
  NOT_APPLICABLE: 'secondary',
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Badge variant={TASK_VARIANT[status]}>{TASK_STATUS_LABELS[status]}</Badge>
}

export function SubtaskStatusBadge({ status }: { status: SubtaskStatus }) {
  return <Badge variant={SUBTASK_VARIANT[status]}>{SUBTASK_LABEL[status]}</Badge>
}

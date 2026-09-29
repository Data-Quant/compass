import { Badge } from '@/components/ui/badge'
import { STATUS_LABELS } from '@/lib/kpi/format'
import type { KpiStatusValue } from '@/lib/kpi/view-types'

const VARIANT: Record<KpiStatusValue, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DRAFT: 'outline',
  LOCKED: 'secondary',
  CLAIMED_DONE: 'secondary',
  NOT_DONE: 'destructive',
  NEEDS_INFO: 'outline',
  REJECTED: 'destructive',
  APPEALED: 'secondary',
  VERIFIED: 'default',
  NOT_VERIFIED: 'destructive',
  CANCELLED: 'outline',
}

export function KpiStatusBadge({ status }: { status: KpiStatusValue }) {
  return <Badge variant={VARIANT[status]}>{STATUS_LABELS[status]}</Badge>
}

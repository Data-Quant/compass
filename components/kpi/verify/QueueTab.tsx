'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatKarachiDate, monthLabel } from '@/lib/kpi/format'
import type { VerificationQueueResponse } from '@/lib/kpi/view-types'
import { KpiStatusBadge } from '../KpiStatusBadge'
import { errorMessage, kpiRequest } from '../kpi-api'
import { KpiReviewDialog } from './KpiReviewDialog'

export function QueueTab() {
  const [data, setData] = useState<VerificationQueueResponse | null>(null)
  const [reviewing, setReviewing] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await kpiRequest<VerificationQueueResponse>('/api/kpi/verify/queue'))
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load the queue'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!data) return <p className="text-sm text-muted-foreground">Loading the queue…</p>
  return (
    <div className="space-y-3">
      {data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No claims waiting.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {data.items.map((item) => (
            <li key={item.kpiId} className="flex flex-wrap items-start justify-between gap-3 p-3">
              <div className="min-w-0 space-y-1">
                <p className="font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {monthLabel(item.monthKey)} · {item.scope === 'DEPARTMENT' ? `Department KPIs (${item.departmentLabel ?? ''})` : `Team of ${item.setter.name}`} · {item.goalTitle}
                </p>
                <p className="text-xs">
                  Claimed by {item.claimedBy?.name ?? 'unknown'}
                  {item.claimedAt ? ` on ${formatKarachiDate(item.claimedAt)}` : ''} · {item.claimerStats.claims} claims, {item.claimerStats.rejections} rejected
                </p>
              </div>
              <div className="flex items-center gap-2">
                <KpiStatusBadge status={item.status} />
                <Badge variant={item.overdue ? 'destructive' : 'outline'}>{item.overdue ? 'Overdue' : `Due ${formatKarachiDate(item.dueAt)}`}</Badge>
                <Button size="sm" aria-label={`Review ${item.title}`} onClick={() => setReviewing(item.kpiId)}>
                  {item.canDecide ? 'Review' : 'View'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {reviewing && <KpiReviewDialog kpiId={reviewing} onClose={() => setReviewing(null)} onDecided={load} />}
    </div>
  )
}

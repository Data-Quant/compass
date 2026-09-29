'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { ReviewFilter, ReviewQueueResponse } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { CyclePicker, useCycles } from './PeopleTab'
import { ReviewCard } from './ReviewCard'

const FILTERS: ReadonlyArray<{ value: ReviewFilter; label: string }> = [
  { value: 'NEEDS_REVIEW', label: 'Needs review' },
  { value: 'FAILED', label: 'Scoring failed' },
  { value: 'AUTO_ACCEPT', label: 'Accepting in 72 hours' },
  { value: 'FOLLOW_UP', label: 'Waiting for detail' },
  { value: 'SCORING', label: 'Being scored' },
  { value: 'DECIDED', label: 'Decided' },
]

export function ReviewTab() {
  const { cycles, cycleId, setCycleId } = useCycles()
  const [filter, setFilter] = useState<ReviewFilter>('NEEDS_REVIEW')
  const [data, setData] = useState<ReviewQueueResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!cycleId) return
    setLoading(true)
    try {
      setData(await weeklyRequest<ReviewQueueResponse>(`/api/admin/weekly/review?cycleId=${encodeURIComponent(cycleId)}&filter=${filter}`))
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load the review queue'))
    } finally {
      setLoading(false)
    }
  }, [cycleId, filter])

  useEffect(() => {
    void load()
  }, [load])

  if (cycles.length === 0) return <p className="text-sm text-muted-foreground">Create a cycle in Setup to review answers.</p>
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CyclePicker cycles={cycles} cycleId={cycleId} onChange={setCycleId} />
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>Refresh</Button>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Show answers">
        {FILTERS.map((f) => (
          <Button key={f.value} size="sm" variant={filter === f.value ? 'default' : 'outline'} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label} ({data?.counts[f.value] ?? 0})
          </Button>
        ))}
      </div>
      {data && data.total > data.items.length && <p className="text-sm text-muted-foreground">Showing the oldest {data.items.length} of {data.total}.</p>}
      {data && data.items.length === 0 && <p className="text-sm text-muted-foreground">Nothing here.</p>}
      <div className="space-y-4">
        {data?.items.map((item) => (
          <ReviewCard key={`${item.responseId}-${item.basedOn.aiScoreId ?? ''}-${item.basedOn.reviewId ?? ''}`} item={item} onChanged={load} />
        ))}
      </div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { WeeklyMeResponse } from '@/lib/weekly/view-types'
import { weeklyRequest } from './weekly-api'

/** Shown on the classic evaluations page while a weekly quarter runs (or when that page's period is weekly). */
export function WeeklyEvaluationsBanner({ forceShow = false }: { forceShow?: boolean }) {
  const [me, setMe] = useState<WeeklyMeResponse | null>(null)
  useEffect(() => {
    weeklyRequest<WeeklyMeResponse>('/api/weekly/me').then(setMe).catch(() => setMe(null))
  }, [])
  if (!forceShow && !(me?.enabled && me.cycleActive)) return null
  const open = me?.openCount ?? 0
  return (
    <Card className="border-emerald-500/20">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Evaluations now happen weekly</p>
          <p className="text-sm text-muted-foreground">{open > 0 ? `You have ${open} question${open === 1 ? '' : 's'} to answer.` : 'You’re all caught up this week.'}</p>
        </div>
        <Button asChild variant="outline"><Link href="/evaluations/weekly">Open weekly evaluations</Link></Button>
      </CardContent>
    </Card>
  )
}

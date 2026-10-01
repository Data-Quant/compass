'use client'

// One "Evaluations" section: while a weekly quarter runs, both the weekly questions and the quarterly (classic)
// evaluations live under it, with this switcher at the top of each page.
import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { WeeklyMeResponse } from '@/lib/weekly/view-types'
import { weeklyRequest } from './weekly-api'

const tab = 'rounded-md px-3 py-1.5 text-sm font-medium transition-colors'

export function EvaluationsSwitcher({ current }: { current: 'weekly' | 'quarterly' }) {
  const [me, setMe] = useState<WeeklyMeResponse | null>(null)
  useEffect(() => {
    weeklyRequest<WeeklyMeResponse>('/api/weekly/me').then(setMe).catch(() => setMe(null))
  }, [])
  if (!me?.enabled || !me.cycleActive) return null
  const open = me.openCount ?? 0
  return (
    <nav aria-label="Evaluations" className="inline-flex gap-1 rounded-lg bg-muted p-1">
      <Link
        href="/evaluations/weekly"
        aria-current={current === 'weekly' ? 'page' : undefined}
        className={`${tab} ${current === 'weekly' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
      >
        Weekly questions{open > 0 ? ` (${open})` : ''}
      </Link>
      <Link
        href="/evaluations"
        aria-current={current === 'quarterly' ? 'page' : undefined}
        className={`${tab} ${current === 'quarterly' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
      >
        Quarterly evaluations
      </Link>
    </nav>
  )
}

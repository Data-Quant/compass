'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { EASE_SOFT } from '@/components/motion/ease'
import { Card, CardContent } from '@/components/ui/card'
import { formatKarachiDate } from '@/lib/weekly/format'
import { ROUND_STAGE_LABELS } from '@/lib/weekly/round-stage'
import type { RoundSummary, RoundView } from '@/lib/weekly/view-types'
import { weeklyRequest } from '../weekly-api'

const ROUND_PAGE = '/admin/evaluation-round'

/** The admin home's view of the evaluation round: where it is, and what waits on HR, one click from each. */
export function AdminRoundSummary() {
  const reduce = useReducedMotion()
  const [view, setView] = useState<RoundView | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      // Weekly evaluations may be switched off, or there may be no round yet: then the panel stays out of the way.
      try {
        const { rounds } = await weeklyRequest<{ rounds: RoundSummary[] }>('/api/admin/rounds')
        const current = rounds.find((r) => r.stage === 'OPEN') ?? rounds.find((r) => r.stage !== 'RELEASED')
        if (!current) return
        const next = await weeklyRequest<RoundView>(`/api/admin/rounds/${current.periodId}`)
        if (!cancelled) setView(next)
      } catch {
        if (!cancelled) setView(null)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  if (!view) return null
  const waiting = [
    { label: 'answers to review', count: view.health?.waitingReview ?? 0, tab: 'review' },
    { label: 'list change requests', count: view.health?.openRequests ?? view.checklist.find((c) => c.key === 'requests')?.count ?? 0, tab: 'people' },
    { label: 'self-evaluations unread', count: view.health?.unreadSelfReviews ?? 0, tab: 'self-reviews' },
  ].filter((w) => w.count > 0)
  const week = view.currentWeek
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE_SOFT }}>
      <Card className="overflow-hidden">
        <CardContent className="grid gap-6 p-6 md:grid-cols-[1.2fr_1fr]">
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Evaluation round · {ROUND_STAGE_LABELS[view.stage]}</p>
            <p className="font-display text-2xl font-semibold tracking-tight">{view.name}</p>
            {week ? (
              <div className="space-y-1.5">
                <div className="h-1.5 max-w-sm overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full origin-left rounded-full bg-primary"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: Math.min(1, week / view.totalWeeks) }}
                    transition={{ duration: reduce ? 0 : 0.9, ease: EASE_SOFT, delay: 0.2 }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">Week {week} of {view.totalWeeks} · closes {formatKarachiDate(view.closesOn)}</p>
              </div>
            ) : null}
            {view.next && <p className="text-sm text-foreground">{view.next.sentence}</p>}
            <Link href={ROUND_PAGE} className="group inline-flex items-center gap-1.5 text-sm font-medium text-primary">
              Open the round
              <ArrowRight className="h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
            <p className="text-sm font-semibold">Waiting on you</p>
            {waiting.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nothing right now.</p>
            ) : (
              <ul className="mt-3 space-y-1">
                {waiting.map((w) => (
                  <li key={w.tab}>
                    <Link
                      href={`${ROUND_PAGE}?tab=${w.tab}`}
                      className="group flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors duration-200 hover:bg-background"
                    >
                      <span className="flex items-baseline gap-2 text-sm">
                        <span className="text-lg font-semibold tabular-nums text-foreground">{w.count}</span>
                        <span className="text-muted-foreground">{w.label}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

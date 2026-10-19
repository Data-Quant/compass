'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { EASE_SOFT } from '@/components/motion/ease'
import { Card, CardContent } from '@/components/ui/card'
import { formatKarachiDate } from '@/lib/weekly/format'
import { cn } from '@/lib/utils'
import type { RoundChecklistItem, RoundView } from '@/lib/weekly/view-types'

export type RoundTab = RoundChecklistItem['tab']

interface Tile { label: string; value: string; hint: string; tab: RoundTab; alert: boolean }

/** HR's overview while the round runs: the week, how much is answered, who is behind, and what waits on HR. */
export function RoundHealthPanel({ view, onOpen }: { view: RoundView; onOpen: (tab: RoundTab) => void }) {
  const reduce = useReducedMotion()
  const health = view.health!
  const week = view.currentWeek ?? 1
  // A round opened ahead of week 1 has not started its questions yet.
  const started = Date.now() >= new Date(view.weekOneStartsOn).getTime()
  const answeredShare = health.asked ? Math.round((health.answered / health.asked) * 100) : 0
  const tiles: Tile[] = [
    { label: 'Answered', value: `${answeredShare}%`, hint: `${health.answered} of ${health.asked} questions so far`, tab: 'progress', alert: false },
    { label: 'Behind', value: String(health.behind), hint: '2 or more weeks behind', tab: 'progress', alert: health.behind > 0 },
    { label: 'Waiting for you', value: String(health.waitingReview), hint: 'answers to review', tab: 'review', alert: health.waitingReview > 0 },
    { label: 'Requests', value: String(health.openRequests), hint: health.unreadSelfReviews ? `list changes · ${health.unreadSelfReviews} self-evaluations unread` : 'list changes waiting', tab: 'people', alert: health.openRequests > 0 },
  ]
  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-display text-2xl font-semibold tracking-tight">{started ? `Week ${week} of ${view.totalWeeks}` : `Questions start ${formatKarachiDate(view.weekOneStartsOn)}`}</p>
            <p className="text-sm text-muted-foreground">Closes {formatKarachiDate(view.closesOn)}</p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full origin-left rounded-full bg-primary"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: started ? week / view.totalWeeks : 0 }}
              transition={{ duration: reduce ? 0 : 0.9, ease: EASE_SOFT }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((t, i) => (
            <motion.button
              key={t.label}
              type="button"
              onClick={() => onOpen(t.tab)}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.06, ease: EASE_SOFT }}
              className={cn(
                'group relative rounded-xl border p-4 text-left transition-[border-color,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:shadow-sm active:scale-[0.99]',
                t.alert ? 'border-amber-200 bg-amber-50/60 hover:border-amber-300 dark:border-amber-900/60 dark:bg-amber-950/20' : 'border-border/70 hover:border-border hover:bg-muted/40',
              )}
            >
              <ArrowUpRight className="absolute right-3 top-3 h-4 w-4 text-muted-foreground opacity-0 transition-[opacity,transform] duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t.label}</p>
              <p className={cn('mt-1.5 text-3xl font-semibold tabular-nums tracking-tight', t.alert ? 'text-amber-700 dark:text-amber-400' : 'text-foreground')}>{t.value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t.hint}</p>
            </motion.button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/** The round's dates at a glance. */
export function RoundKeyDates({ view }: { view: RoundView }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Quarter', value: `${formatKarachiDate(view.startDate)} to ${formatKarachiDate(view.endDate)}` },
    { label: 'Weekly questions', value: `From ${formatKarachiDate(view.weekOneStartsOn)}, ${view.questionWeeks} weeks plus 2 catch-up` },
    ...(view.reviewOpenedAt ? [{ label: 'Review stage opened', value: formatKarachiDate(view.reviewOpenedAt) }] : []),
    ...(view.reviewDeadline ? [{ label: 'Review stage ends', value: formatKarachiDate(view.reviewDeadline) }] : []),
    { label: 'Round closes', value: formatKarachiDate(view.closesOn) },
  ]
  return (
    <Card>
      <CardContent className="p-6">
        <p className="mb-4 text-sm font-semibold">Key dates</p>
        <dl className="flex flex-wrap gap-x-12 gap-y-4">
          {rows.map((r) => (
            <div key={r.label}>
              <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{r.label}</dt>
              <dd className="mt-1 text-sm text-foreground">{r.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

'use client'

import { forwardRef } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { levelMeaning } from '@/lib/weekly/levels'
import { PERSPECTIVE_LABELS } from '@/lib/weekly/perspectives'
import type { ReviewItem } from '@/lib/weekly/view-types'
import { cn } from '@/lib/utils'

interface ReviewCardProps {
  item: ReviewItem
  busy: boolean
  onAccept: () => void
  onSet: () => void
  onRetry: () => void
}

/** One answer for HR to decide: the statements with the evaluator's pick, the note, and the model's suggestion. */
export const ReviewCard = forwardRef<HTMLDivElement, ReviewCardProps>(function ReviewCard({ item, busy, onAccept, onSet, onRetry }, ref) {
  const modelDiffers = item.ai && item.ai.score !== item.chosen.level
  return (
    <Card ref={ref}>
      <CardContent className="p-0">
        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">Week {item.weekIndex}</span>
              <span>{item.topic}</span>
              <span aria-hidden>·</span>
              <span><span className="font-medium text-foreground">{item.evaluator.name}</span> about <span className="font-medium text-foreground">{item.evaluatee.name}</span> ({PERSPECTIVE_LABELS[item.perspective].toLowerCase()})</span>
            </p>
            <p className="text-base font-medium leading-snug">{item.question}</p>
          </div>
          <ol className="space-y-1 text-sm">
            {item.statements.map((s) => {
              const chosen = s.id === item.chosen.id
              return (
                <li
                  key={s.id}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border px-3 py-2 transition-colors',
                    chosen ? 'border-primary/30 bg-primary/[0.06] text-foreground' : 'border-transparent text-muted-foreground',
                  )}
                >
                  <span className={cn('w-7 shrink-0 tabular-nums', chosen && 'font-semibold text-primary')} title={levelMeaning(s.level)}>{s.level}</span>
                  <span className="flex-1">{s.text}</span>
                  {chosen && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Their pick</span>}
                </li>
              )
            })}
          </ol>
          {item.note && (
            <blockquote className="rounded-lg border-l-2 border-primary/40 bg-muted/50 px-3 py-2 text-sm italic text-foreground">“{item.note}”</blockquote>
          )}
          {item.ai && (
            <div className={cn('flex gap-3 rounded-xl border p-3', modelDiffers ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20' : 'border-border/70 bg-muted/30')}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background text-lg font-semibold tabular-nums shadow-sm">{item.ai.score}</div>
              <div className="min-w-0 space-y-0.5 text-sm">
                <p className="flex flex-wrap items-center gap-1.5 font-medium">
                  <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
                  Model suggests {levelMeaning(item.ai.score)}
                  {modelDiffers && <span className="font-normal text-amber-700 dark:text-amber-400">· differs from their pick ({item.chosen.level})</span>}
                </p>
                <p className="text-muted-foreground">{item.ai.rationale}</p>
              </div>
            </div>
          )}
          {item.jobError && <p className="text-sm text-destructive">The model could not score this ({item.jobError}).</p>}
          {item.decision && (
            <p className="text-sm">Confirmed {item.decision.finalScore} by {item.decision.reviewer}{item.decision.reason ? `: “${item.decision.reason}”` : ''}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-muted/20 px-5 py-3">
          <p className="text-xs text-muted-foreground">
            {item.fours.exempt ? 'Exempt from the cap on 4s.' : `${item.evaluator.name}: ${item.fours.used} of ${item.fours.limit} confirmed 4s used in this relationship.`}
          </p>
          <div className="flex flex-wrap gap-2">
            {item.state === 'FAILED' && <Button size="sm" variant="outline" disabled={busy} onClick={onRetry}>Try the model again</Button>}
            <Button size="sm" variant="outline" disabled={busy} onClick={onSet}>{item.decision ? 'Change score' : 'Set score'}</Button>
            {item.ai && !item.decision && <Button size="sm" disabled={busy} onClick={onAccept}>Confirm {item.ai.score}</Button>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
})

'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'
import { EASE_SOFT } from '@/components/motion/ease'
import { ROUND_STAGE_LABELS, ROUND_STAGES, type RoundStage } from '@/lib/weekly/round-stage'
import { cn } from '@/lib/utils'

const STAGE_HINTS: Record<RoundStage, string> = {
  DRAFT: 'Set the lists',
  REVIEW: 'People check lists',
  OPEN: 'Weekly questions',
  CLOSED: 'Forms and results',
  RELEASED: 'Shared with people',
}

/** The round's five stages as a line that fills up to the current one. */
export function RoundStepper({ stage }: { stage: RoundStage }) {
  const reduce = useReducedMotion()
  const current = ROUND_STAGES.indexOf(stage)
  const share = current / (ROUND_STAGES.length - 1)
  return (
    <div className="relative">
      {/* The track sits behind the dots, from the first dot's centre to the last one's. */}
      <div className="absolute left-[10%] right-[10%] top-[13px] h-px bg-border" aria-hidden>
        <motion.div
          className="h-full origin-left bg-primary"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: share }}
          transition={{ duration: reduce ? 0 : 0.9, ease: EASE_SOFT, delay: reduce ? 0 : 0.15 }}
        />
      </div>
      <ol className="relative grid grid-cols-5" aria-label="Round stages">
        {ROUND_STAGES.map((s, i) => {
          const done = i < current
          const now = i === current
          return (
            <li key={s} className="flex flex-col items-center gap-2 text-center" aria-current={now ? 'step' : undefined}>
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition-colors duration-500',
                  done && 'border-primary bg-primary text-primary-foreground',
                  now && 'border-primary bg-background text-primary ring-4 ring-primary/15',
                  !done && !now && 'border-border bg-background text-muted-foreground',
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
              </span>
              <span className="space-y-0.5">
                <span className={cn('block text-sm', now ? 'font-semibold text-foreground' : done ? 'text-foreground' : 'text-muted-foreground')}>{ROUND_STAGE_LABELS[s]}</span>
                <span className="hidden text-xs text-muted-foreground sm:block">{STAGE_HINTS[s]}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

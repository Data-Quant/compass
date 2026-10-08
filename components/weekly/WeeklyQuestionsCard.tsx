'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, CalendarCheck, CheckCircle2, ClipboardList, Lock, NotebookPen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { EvaluationsCardView } from '@/lib/weekly/service/dashboard-card'
import { weeklyRequest } from './weekly-api'

const LOOK: Record<EvaluationsCardView['state'], { icon: typeof CalendarCheck; tone: string; action: string | null }> = {
  CHECK_LISTS: { icon: ClipboardList, tone: 'bg-sky-500/10 text-sky-600 dark:text-sky-400', action: 'Review my lists' },
  THIS_WEEK: { icon: CalendarCheck, tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', action: 'Answer now' },
  CAUGHT_UP: { icon: CheckCircle2, tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', action: null },
  CLOSED: { icon: Lock, tone: 'bg-muted text-muted-foreground', action: null },
}

/**
 * UX spec, section 5: the Evaluations card always says, in one sentence, what to do now and by when. It also says when
 * this month's self-evaluation is waiting, and tells a lead when a team member has sent theirs.
 */
export function WeeklyQuestionsCard() {
  const [card, setCard] = useState<EvaluationsCardView | null>(null)
  useEffect(() => {
    weeklyRequest<{ card: EvaluationsCardView | null }>('/api/weekly/card').then((r) => setCard(r.card)).catch(() => setCard(null))
  }, [])
  if (!card) return null
  const look = LOOK[card.state]
  const Icon = look.icon
  const action = look.action ?? (card.selfReview || card.leadNotices.length ? 'Open' : null)
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className={`rounded-full p-2.5 ${look.tone}`}><Icon className="h-5 w-5" /></div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Evaluations</p>
              <p className="font-semibold text-foreground">{card.message}</p>
              {card.detail && <p className="text-sm text-muted-foreground">{card.detail}</p>}
              {card.selfReview && <p className="flex items-center gap-1.5 text-sm"><NotebookPen className="h-3.5 w-3.5 text-muted-foreground" /> {card.selfReview}</p>}
              {card.leadNotices.slice(0, 3).map((notice) => <p key={notice} className="text-sm text-muted-foreground">{notice}</p>)}
              {card.leadNotices.length > 3 && <p className="text-sm text-muted-foreground">and {card.leadNotices.length - 3} more</p>}
            </div>
          </div>
          {action && (
            <Button asChild>
              <Link href={card.href} className="gap-1.5">{action} <ArrowRight className="h-3.5 w-3.5" /></Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

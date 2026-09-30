'use client'

import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { monthLabel, shiftMonth } from '@/lib/kpi/format'

interface NextMonthPromptProps { monthKey: string; onOpen: (monthKey: string) => void }

/** A locked month cannot take new KPIs; point setters at the next month instead of leaving them without a button. */
export function NextMonthPrompt({ monthKey, onOpen }: NextMonthPromptProps) {
  const next = shiftMonth(monthKey, 1)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-3 text-sm">
      <span className="text-muted-foreground">{monthLabel(monthKey)} KPIs are locked. Claims and verification continue here.</span>
      <Button size="sm" onClick={() => onOpen(next)}>
        Set KPIs for {monthLabel(next)} <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toLocalDateValue } from '@/components/projects/workspace-utils'
import type { AnalyticsRange, AnalyticsRangeKey } from '@/lib/project-analytics'
import { cn } from '@/lib/utils'
import { formatDay } from './chart-theme'

export type RangeSelection = { range: Exclude<AnalyticsRangeKey, 'custom'> } | { from: string; to: string }

const PRESETS = ['30d', '90d', '6m', '12m'] as const
// Matches the API limit (lib/project-analytics MAX_RANGE_DAYS) so the picker can't build a rejected range.
const MAX_SPAN_DAYS = 730
const KARACHI_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' })

const toDate = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12)
const earliest = (a: Date, b: Date) => (a < b ? a : b)

function DateField({ label, value, disabled, onPick }: {
  label: string
  value: string
  disabled: { before?: Date; after?: Date }
  onPick: (iso: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label} date, ${formatDay(value)} ${value.slice(0, 4)}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted/50"
        >
          <span className="text-muted-foreground">{label}</span>
          <span className="tabular-nums">{formatDay(value)} {value.slice(0, 4)}</span>
          <CalendarDays aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={toDate(value)}
          defaultMonth={toDate(value)}
          disabled={[disabled.before ? { before: disabled.before } : null, disabled.after ? { after: disabled.after } : null].filter((matcher) => matcher !== null)}
          onSelect={(date) => {
            if (!date) return
            onPick(toLocalDateValue(date))
            setOpen(false)
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}

export function RangeControl({ range, onChange }: { range: AnalyticsRange; onChange: (next: RangeSelection) => void }) {
  const today = toDate(KARACHI_DAY.format(new Date()))
  const from = toDate(range.from)
  const to = toDate(range.to)
  const isCustom = range.key === 'custom'

  const segment = (pressed: boolean) => cn(
    'rounded-md px-2.5 py-1 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    pressed ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isCustom && (
        <div className="flex flex-wrap items-center gap-1.5">
          <DateField
            label="From"
            value={range.from}
            disabled={{ before: addDays(to, -MAX_SPAN_DAYS), after: to }}
            onPick={(iso) => onChange({ from: iso, to: range.to })}
          />
          <DateField
            label="To"
            value={range.to}
            disabled={{ before: from, after: earliest(today, addDays(from, MAX_SPAN_DAYS)) }}
            onPick={(iso) => onChange({ from: range.from, to: iso })}
          />
        </div>
      )}
      <div role="group" aria-label="Date range" className="flex w-fit items-center gap-0.5 rounded-lg bg-muted/50 p-1">
        {PRESETS.map((key) => (
          <button key={key} type="button" aria-pressed={range.key === key} onClick={() => onChange({ range: key })} className={segment(range.key === key)}>
            {key}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={isCustom}
          onClick={() => { if (!isCustom) onChange({ from: range.from, to: range.to }) }}
          className={segment(isCustom)}
        >
          Custom
        </button>
      </div>
    </div>
  )
}

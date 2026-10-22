'use client'

import { useState } from 'react'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { dueState, parseTaskDate, toLocalDateValue, type DueStateKind } from './workspace-utils'

const STATE_CLASS: Record<DueStateKind, string> = {
  none: 'text-muted-foreground/70',
  normal: 'text-muted-foreground',
  soon: 'font-medium text-amber-700 dark:text-amber-400',
  overdue: '',
  done: 'text-muted-foreground',
}

interface DueDatePickerProps {
  dueDate: string | null
  /** Called with `YYYY-MM-DD`, or null when the deadline is cleared. */
  onChange: (dueDate: string | null) => void
  done?: boolean
  overdue?: boolean
  disabled?: boolean
  ariaLabel: string
  id?: string
  className?: string
}

// Same Calendar + "Clear deadline" popover as TaskDetailPanel, with the card's due states on the trigger.
export function DueDatePicker({ dueDate, onChange, done = false, overdue = false, disabled, ariaLabel, id, className }: DueDatePickerProps) {
  const [open, setOpen] = useState(false)
  const state = dueState(dueDate, { done, overdue })
  const label = state.kind === 'overdue' ? (
    <span className="inline-flex items-center gap-1 rounded-[4px] bg-red-500/10 px-1.5 py-0.5 font-medium text-red-600 dark:text-red-400">
      {state.label}
      <span>{state.lateLabel}</span>
    </span>
  ) : state.label

  if (disabled) {
    return (
      <span id={id} title={state.title} className={cn('inline-flex h-8 items-center whitespace-nowrap px-2 text-xs tabular-nums', STATE_CLASS[state.kind], className)}>
        {label}
      </span>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          aria-label={ariaLabel}
          title={state.title}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs tabular-nums transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted',
            STATE_CLASS[state.kind],
            className,
          )}
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[80] w-auto p-0">
        <Calendar
          mode="single"
          selected={parseTaskDate(dueDate) ?? undefined}
          onSelect={(date) => {
            if (!date) return
            onChange(toLocalDateValue(date))
            setOpen(false)
          }}
          autoFocus
        />
        {dueDate ? (
          <div className="border-t border-border/60 p-2">
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
              className="w-full rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              Clear deadline
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

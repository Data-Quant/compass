'use client'

import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { PRIORITY_ICON, PRIORITY_LABEL } from './workspace-utils'
import type { WorkspacePriority } from './workspace-types'

// Same option list the task tables use today (no URGENT choice, but URGENT still displays).
const PRIORITIES: WorkspacePriority[] = ['HIGH', 'MEDIUM', 'LOW']

function PriorityIcon({ priority, className }: { priority: WorkspacePriority; className?: string }) {
  const { icon: Icon, className: tone } = PRIORITY_ICON[priority]
  return <Icon aria-hidden className={cn('h-3.5 w-3.5 shrink-0', tone, className)} />
}

interface PriorityPillProps {
  priority: WorkspacePriority
  editable?: boolean
  onChange?: (priority: WorkspacePriority) => void
  disabled?: boolean
  /** Accessible name for the trigger, e.g. `Priority for ${task.title}`. */
  ariaLabel?: string
}

export function PriorityPill({ priority, editable = false, onChange, disabled, ariaLabel }: PriorityPillProps) {
  const content = (
    <span className="inline-flex items-center gap-1.5">
      <PriorityIcon priority={priority} />
      <span>{PRIORITY_LABEL[priority]}</span>
    </span>
  )

  if (!editable) {
    return <span className="inline-flex h-7 items-center px-2 text-xs text-foreground">{content}</span>
  }

  return (
    <Select value={priority} onValueChange={(value) => onChange?.(value as WorkspacePriority)} disabled={disabled}>
      <SelectTrigger
        aria-label={ariaLabel ?? 'Priority'}
        // Chevron (the only direct svg) stays hidden until hover, focus or open.
        className="h-7 w-auto gap-1.5 border-transparent bg-transparent px-2 text-xs shadow-none hover:bg-muted data-[state=open]:bg-muted [&>svg]:opacity-0 hover:[&>svg]:opacity-50 focus-visible:[&>svg]:opacity-50 data-[state=open]:[&>svg]:opacity-50"
      >
        {content}
      </SelectTrigger>
      <SelectContent>
        {PRIORITIES.map((p) => (
          <SelectItem key={p} value={p}>
            <span className="inline-flex items-center gap-1.5">
              <PriorityIcon priority={p} />
              {PRIORITY_LABEL[p]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

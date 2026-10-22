'use client'

import { UserAvatar } from '@/components/composed/UserAvatar'
import { cn } from '@/lib/utils'

type Person = { id: string; name: string }

interface PeopleStackProps {
  assignee: Person | null
  assistants?: Array<{ id: string; user: Person }>
  /** sm: 20px lead and 18px co-assignees (cards). md: 24px (table rows). */
  size: 'sm' | 'md'
  showFirstName?: boolean
}

const SIZE = {
  sm: { lead: 'h-5 w-5 text-[9px]', rest: 'h-[18px] w-[18px] text-[8px]', max: 2, space: '-space-x-1' },
  md: { lead: 'h-6 w-6 text-[10px]', rest: 'h-6 w-6 text-[10px]', max: 3, space: '-space-x-1.5' },
}

export function PeopleStack({ assignee, assistants = [], size, showFirstName = true }: PeopleStackProps) {
  const s = SIZE[size]
  if (!assignee && assistants.length === 0) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span aria-hidden className={cn('rounded-full border border-dashed border-muted-foreground/40', s.lead.split(' ').slice(0, 2).join(' '))} />
        <span className="text-xs text-muted-foreground">Unassigned</span>
      </span>
    )
  }

  const people = [
    ...(assignee ? [{ ...assignee, role: 'Assignee' }] : []),
    ...assistants.map((a) => ({ ...a.user, role: 'Co-assignee' })),
  ]
  // In md, the assignee joins the stack; in sm it leads and co-assignees follow it.
  const stacked = size === 'sm' ? people.slice(assignee ? 1 : 0) : people
  const shown = stacked.slice(0, s.max)
  const hidden = stacked.slice(s.max)
  const single = people.length === 1

  return (
    <span className="inline-flex min-w-0 items-center">
      {size === 'sm' && assignee && (
        <>
          <UserAvatar name={assignee.name} size="xs" className={s.lead} title={`Assignee: ${assignee.name}`} />
          {showFirstName && (
            <span className="ml-1.5 max-w-[96px] truncate text-xs text-foreground">{assignee.name.split(' ')[0]}</span>
          )}
        </>
      )}
      <span className={cn('flex', size === 'sm' ? 'ml-1.5' : '', s.space)}>
        {shown.map((p, i) => (
          <UserAvatar
            key={`${p.role}-${p.id}-${i}`}
            name={p.name}
            size="xs"
            className={cn(s.rest, 'ring-2 ring-card')}
            title={`${p.role}: ${p.name}`}
          />
        ))}
      </span>
      {hidden.length > 0 && (
        <span className="ml-1 text-[11px] tabular-nums text-muted-foreground" title={hidden.map((p) => p.name).join(', ')}>
          +{hidden.length}
        </span>
      )}
      {size === 'md' && single && showFirstName && (
        <span className="ml-1.5 max-w-[96px] truncate text-xs text-foreground">{people[0].name.split(' ')[0]}</span>
      )}
    </span>
  )
}

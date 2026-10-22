'use client'

import type { ReactNode } from 'react'
import { useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { filterPeopleByQuery, nextFocusIndex } from './workspace-utils'

// Mounted only while its dropdown is open, so the query resets and the input takes focus on every open.
export function PeopleSearchList<T extends { name: string; email?: string | null }>({
  people,
  pinned,
  children,
}: {
  people: T[]
  pinned?: ReactNode
  children: (filtered: T[]) => ReactNode
}) {
  const [query, setQuery] = useState('')
  const filtered = filterPeopleByQuery(people, query)
  const root = useRef<HTMLDivElement>(null)

  // Arrows walk input -> buttons; Enter in the input picks the first match (buttons marked data-person-option).
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const fromInput = (event.target as HTMLElement).tagName === 'INPUT'
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const items = Array.from(root.current?.querySelectorAll<HTMLElement>('input, button:not(:disabled)') ?? [])
      const at = items.indexOf(event.target as HTMLElement)
      if (at >= 0) {
        event.preventDefault()
        items[nextFocusIndex(at, items.length, event.key)]?.focus()
      }
    } else if (fromInput && event.key === 'Enter') {
      event.preventDefault()
      root.current?.querySelector<HTMLElement>('[data-person-option]:not(:disabled)')?.click()
    }
    // Keep typing from reaching the menu's typeahead; Escape still closes.
    if (fromInput && event.key !== 'Escape') event.stopPropagation()
  }

  return (
    <div ref={root} onKeyDown={onKeyDown}>
      <div className="p-1">
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          placeholder="Search people"
          aria-label="Search people"
          className="h-8 text-sm"
        />
      </div>
      {pinned}
      {children(filtered)}
      {people.length > 0 && filtered.length === 0 && (
        <p className="px-3 py-2 text-sm text-muted-foreground">No people match</p>
      )}
    </div>
  )
}

// Single-select person picker with search; replaces a Radix Select, which cannot hold an input.
export function PersonSelect<T extends { id: string; name: string; email?: string | null }>({
  people,
  value,
  onValueChange,
  placeholder,
  unassignedValue,
  disabled,
  id,
  ariaLabel,
  className,
}: {
  people: T[]
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  unassignedValue?: string
  disabled?: boolean
  id?: string
  ariaLabel?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const label = unassignedValue && value === unassignedValue
    ? 'Unassigned'
    : people.find((person) => person.id === value)?.name
  const choose = (next: string) => { onValueChange(next); setOpen(false) }
  const itemClass = 'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent focus-visible:bg-accent'
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn('h-9 w-full justify-between px-3 font-normal', className)}
        >
          <span className={cn('truncate', !label && 'text-muted-foreground')}>{label || placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-52 p-1">
        <PeopleSearchList
          people={people}
          pinned={unassignedValue && (
            <button type="button" onClick={() => choose(unassignedValue)} className={cn(itemClass, 'text-muted-foreground')}>
              Unassigned
            </button>
          )}
        >
          {(filtered) => (
            <div className="max-h-60 overflow-y-auto">
              {filtered.map((person) => (
                <button key={person.id} type="button" data-person-option onClick={() => choose(person.id)} className={itemClass}>
                  <Check className={cn('h-4 w-4 shrink-0', person.id !== value && 'opacity-0')} />
                  <span className="truncate">{person.name}</span>
                </button>
              ))}
            </div>
          )}
        </PeopleSearchList>
      </PopoverContent>
    </Popover>
  )
}

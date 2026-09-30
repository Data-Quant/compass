'use client'

// Notion-style cells for setting KPIs: click to edit, Enter or clicking away saves, Escape cancels.
// Each cell saves on its own; a failed save shows why and puts the old value back.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { PersonRef } from '@/lib/kpi/view-types'

export type SaveResult = Promise<boolean>

const cellButton = 'w-full rounded px-1 py-0.5 text-left hover:bg-muted focus:bg-muted focus:outline-none'
const cellInput = 'w-full rounded border border-input bg-background px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring'

interface InlineTextProps {
  value: string
  label: string
  placeholder?: string
  minLength?: number
  maxLength: number
  className?: string
  onSave: (value: string) => SaveResult
}

export function InlineText({ value, label, placeholder, minLength = 3, maxLength, className, onSave }: InlineTextProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const done = useRef(false)

  useEffect(() => setDraft(value), [value])

  async function commit() {
    if (done.current) return
    done.current = true
    const next = draft.trim()
    if (next === value) {
      setEditing(false)
      return
    }
    if (next.length < minLength) {
      setError(`Use at least ${minLength} characters`)
      done.current = false
      return
    }
    const ok = await onSave(next)
    if (!ok) setDraft(value)
    setError(null)
    setEditing(false)
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') void commit()
    if (event.key === 'Escape') {
      done.current = true
      setDraft(value)
      setError(null)
      setEditing(false)
    }
  }

  if (!editing) {
    return (
      <button type="button" aria-label={`Edit ${label}`} className={`${cellButton} ${className ?? ''}`} onClick={() => { done.current = false; setEditing(true) }}>
        {value || <span className="text-muted-foreground">{placeholder ?? 'Empty'}</span>}
      </button>
    )
  }
  return (
    <div className="space-y-0.5">
      <input
        autoFocus
        aria-label={label}
        className={cellInput}
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => void commit()}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

interface InlineDateProps { value: string; label: string; onSave: (value: string) => SaveResult }

export function InlineDate({ value, label, onSave }: InlineDateProps) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  async function commit(next: string) {
    if (!next || next === value) return
    if (!(await onSave(next))) setDraft(value)
  }
  return (
    <input
      type="date"
      aria-label={label}
      className={`${cellInput} w-36`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => void commit(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') void commit((e.target as HTMLInputElement).value) }}
    />
  )
}

interface InlineSelectProps<T extends string> { value: T; label: string; options: Array<{ value: T; label: string }>; onSave: (value: T) => SaveResult }

export function InlineSelect<T extends string>({ value, label, options, onSave }: InlineSelectProps<T>) {
  return (
    <select
      aria-label={label}
      className={`${cellInput} w-auto`}
      value={value}
      onChange={(e) => { if (e.target.value !== value) void onSave(e.target.value as T) }}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

interface InlineOwnersProps {
  value: PersonRef[]
  options: PersonRef[]
  label: string
  onSave: (ids: string[]) => SaveResult
}

/** Owners as a checklist in a popover; saved when it closes, and never empty. */
export function InlineOwners({ value, options, label, onSave }: InlineOwnersProps) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>(value.map((p) => p.id))
  useEffect(() => setSelected(value.map((p) => p.id)), [value])
  const choices = [...options, ...value.filter((p) => !options.some((o) => o.id === p.id))]

  async function close(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) return
    const before = value.map((p) => p.id).sort().join(',')
    if (selected.length === 0 || [...selected].sort().join(',') === before) {
      setSelected(value.map((p) => p.id))
      return
    }
    if (!(await onSave(selected))) setSelected(value.map((p) => p.id))
  }

  const names = choices.filter((p) => selected.includes(p.id)).map((p) => p.name)
  return (
    <Popover open={open} onOpenChange={(o) => void close(o)}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} className={`${cellButton} flex items-center gap-1 text-xs text-muted-foreground`}>
          <span className="truncate">Owners: {names.length ? names.join(', ') : 'choose'}</span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-2 p-3">
        {choices.length === 0 && <p className="text-sm text-muted-foreground">Nobody can own KPIs here yet.</p>}
        {choices.map((person) => (
          <label key={person.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              aria-label={person.name}
              checked={selected.includes(person.id)}
              onCheckedChange={(checked) => setSelected((cur) => (checked === true ? [...cur, person.id] : cur.filter((id) => id !== person.id)))}
            />
            <span>{person.name}</span>
          </label>
        ))}
        {selected.length === 0 && <p className="text-xs text-destructive">Choose at least one owner.</p>}
      </PopoverContent>
    </Popover>
  )
}

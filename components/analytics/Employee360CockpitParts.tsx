'use client'

import { useMemo, useState } from 'react'
import {
  Archive,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  CircleDot,
  GitCompareArrows,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import styles from './Employee360Cockpit.module.css'

export type CockpitAvailability = 'AVAILABLE' | 'PARTIAL' | 'NO_DATA'
export type CockpitTone = 'neutral' | 'positive' | 'attention' | 'comparison' | 'primary'

const AVAILABILITY_LABEL: Record<CockpitAvailability, string> = {
  AVAILABLE: 'verified',
  PARTIAL: 'partial',
  NO_DATA: 'no data',
}

const AVAILABILITY_CLASS: Record<CockpitAvailability, string> = {
  AVAILABLE:
    'border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-300',
  PARTIAL:
    'border-amber-600/30 bg-amber-500/10 text-amber-700 dark:border-amber-300/30 dark:text-amber-300',
  NO_DATA: 'border-border bg-muted/40 text-muted-foreground',
}

export interface DirectoryPerson {
  id: string
  name: string
  department: string | null
  position: string | null
  status: 'ACTIVE' | 'ARCHIVED'
  dataCoverage?: number | null
}

export interface CockpitTimelineEvent {
  id: string
  date: string
  domain: string
  title: string
  detail?: string | null
  source?: string | null
  asOf?: string | null
  tone?: CockpitTone
}

export function AvailabilityMark({
  value,
  compact = false,
}: {
  value: CockpitAvailability
  compact?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium uppercase tracking-[0.12em]',
        compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-1 text-[9px]',
        AVAILABILITY_CLASS[value]
      )}
    >
      {AVAILABILITY_LABEL[value]}
    </span>
  )
}

export function CockpitPanel({
  title,
  eyebrow,
  availability,
  action,
  className,
  children,
}: {
  title: string
  eyebrow?: string
  availability?: CockpitAvailability
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn('rounded-xl p-4 sm:p-5', styles.panel, className)}>
      <div className="relative z-10 mb-4 flex items-start justify-between gap-4">
        <div>
          {eyebrow && (
            <p className="mb-1 text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {availability && <AvailabilityMark value={availability} />}
          {action}
        </div>
      </div>
      <div className="relative z-10">{children}</div>
    </section>
  )
}

export function SignalTile({
  label,
  value,
  detail,
  comparisonValue,
  availability = 'AVAILABLE',
  tone = 'neutral',
  onInspect,
}: {
  label: string
  value: string
  detail?: string | null
  comparisonValue?: string | null
  availability?: CockpitAvailability
  tone?: CockpitTone
  onInspect?: () => void
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-700 dark:text-emerald-300'
      : tone === 'attention'
        ? 'text-red-600 dark:text-red-400'
        : tone === 'comparison'
          ? 'text-accent'
          : tone === 'primary'
            ? 'text-primary'
            : 'text-foreground'

  const Comp = onInspect ? 'button' : 'div'

  return (
    <Comp
      {...(onInspect ? { type: 'button' as const, onClick: onInspect } : {})}
      className={cn(
        'group relative min-h-[118px] overflow-hidden rounded-xl border border-border bg-card p-3 text-left shadow-sm',
        onInspect &&
          'transition-colors hover:border-primary/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">
          {label}
        </p>
        <AvailabilityMark value={availability} compact />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <span
          className={cn(
            'font-mono text-2xl leading-none tracking-[-0.04em]',
            styles.telemetry,
            availability === 'NO_DATA' ? 'text-muted-foreground' : toneClass
          )}
        >
          {availability === 'NO_DATA' ? '—' : value}
        </span>
        {comparisonValue && (
          <span className="font-mono text-xs text-accent">
            {comparisonValue}
          </span>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
        {detail || (availability === 'NO_DATA' ? 'No source records available.' : 'Source verified.')}
      </p>
      {onInspect && (
        <ArrowRight className="absolute bottom-3 right-3 h-3 w-3 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      )}
    </Comp>
  )
}

export function SubjectRail({
  people,
  selectedId,
  compareId,
  query,
  status,
  onQueryChange,
  onStatusChange,
  onSelect,
  onCompare,
  className,
}: {
  people: DirectoryPerson[]
  selectedId: string | null
  compareId: string | null
  query: string
  status: 'ACTIVE' | 'ARCHIVED'
  onQueryChange: (value: string) => void
  onStatusChange: (value: 'ACTIVE' | 'ARCHIVED') => void
  onSelect: (id: string) => void
  onCompare: (id: string | null) => void
  className?: string
}) {
  const departments = useMemo(
    () => new Set(people.map((person) => person.department).filter(Boolean)).size,
    [people]
  )

  return (
    <aside
      aria-label="Employee directory"
      className={cn(
        'flex h-full min-h-0 flex-col border-r border-border bg-card',
        className
      )}
    >
      <div className="border-b border-border p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Subject index</p>
            <p className="mt-0.5 font-mono text-xs text-foreground">
              {people.length} records · {departments} teams
            </p>
          </div>
          <Users className="h-4 w-4 text-primary" />
        </div>
        <label className="relative block">
          <span className="sr-only">Search employees</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Name, team, or role"
            className="h-9 border-input bg-background pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Clear employee search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </label>
        <div className="mt-2 grid grid-cols-2 rounded-lg border border-border bg-muted/30 p-0.5">
          {(['ACTIVE', 'ARCHIVED'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onStatusChange(value)}
              aria-pressed={status === value}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                status === value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {value === 'ACTIVE' ? <CircleDot className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
              {value === 'ACTIVE' ? 'Active' : 'Archive'}
            </button>
          ))}
        </div>
      </div>

      <div className={cn('min-h-0 flex-1 overflow-y-auto p-2', styles.rail)}>
        {people.length === 0 ? (
          <div className="px-3 py-10 text-center text-xs text-muted-foreground">
            No employees match this view.
          </div>
        ) : (
          <ul className="space-y-1">
            {people.map((person) => {
              const selected = selectedId === person.id
              const comparing = compareId === person.id
              return (
                <li key={person.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelect(person.id)}
                    aria-current={selected ? 'true' : undefined}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2.5 pr-10 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected
                        ? 'border-primary/30 bg-primary/10'
                        : comparing
                          ? 'border-accent/30 bg-accent/10'
                          : 'border-transparent hover:border-border hover:bg-muted/40'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'h-1.5 w-1.5 shrink-0 rounded-full',
                          selected
                            ? 'bg-primary'
                            : comparing
                              ? 'bg-accent'
                              : 'bg-muted-foreground/60'
                        )}
                      />
                      <span className="truncate text-xs font-medium text-foreground">
                        {person.name}
                      </span>
                    </div>
                    <p className="mt-1 truncate pl-3.5 text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                      {[person.position, person.department].filter(Boolean).join(' · ') ||
                        'Role not recorded'}
                    </p>
                  </button>
                  {!selected && (
                    <button
                      type="button"
                      onClick={() => onCompare(comparing ? null : person.id)}
                      aria-pressed={comparing}
                      aria-label={
                        comparing
                          ? `Stop comparing with ${person.name}`
                          : `Compare with ${person.name}`
                      }
                      className={cn(
                        'absolute right-2 top-1/2 -translate-y-1/2 rounded-md border p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        comparing
                          ? 'border-accent/40 bg-accent/10 text-foreground'
                          : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {comparing ? <Check className="h-3 w-3" /> : <GitCompareArrows className="h-3 w-3" />}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}

function timelineToneClass(tone: CockpitTone | undefined) {
  if (tone === 'positive') return 'text-emerald-700 dark:text-emerald-300'
  if (tone === 'attention') return 'text-red-600 dark:text-red-400'
  if (tone === 'comparison') return 'text-accent'
  if (tone === 'primary') return 'text-primary'
  return 'text-muted-foreground'
}

function domainIcon(domain: string) {
  const normalized = domain.toLowerCase()
  if (normalized.includes('client')) return BriefcaseBusiness
  if (normalized.includes('evaluation')) return ShieldCheck
  if (normalized.includes('task') || normalized.includes('leave')) return CalendarClock
  return CircleDot
}

export function CockpitTimeline({ events }: { events: CockpitTimelineEvent[] }) {
  const [domain, setDomain] = useState<string>('ALL')
  const domains = useMemo(
    () => ['ALL', ...new Set(events.map((event) => event.domain.toUpperCase()))],
    [events]
  )
  const visible =
    domain === 'ALL'
      ? events
      : events.filter((event) => event.domain.toUpperCase() === domain)

  if (!events.length) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-14 text-center text-sm text-muted-foreground">
        No dated source events are available for this subject.
      </div>
    )
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-1.5" aria-label="Timeline domain filters">
        {domains.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setDomain(item)}
            aria-pressed={domain === item}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              domain === item
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground'
            )}
          >
            {item}
          </button>
        ))}
      </div>
      <ol className="relative space-y-1 pl-7">
        <span
          aria-hidden
          className={cn('absolute bottom-3 left-[9px] top-3 w-px', styles.timelineLine)}
        />
        {visible.map((event) => {
          const Icon = domainIcon(event.domain)
          return (
            <li key={event.id} className="relative rounded-lg px-3 py-3 hover:bg-muted/30">
              <span
                className={cn(
                  'absolute left-[-25px] top-3.5 flex h-[19px] w-[19px] items-center justify-center rounded-full border border-border bg-card',
                  timelineToneClass(event.tone)
                )}
              >
                <Icon className="h-2.5 w-2.5" />
              </span>
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div>
                  <p className="text-xs font-medium text-foreground">{event.title}</p>
                  {event.detail && (
                    <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
                      {event.detail}
                    </p>
                  )}
                </div>
                <time className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {new Date(event.date).toLocaleDateString(undefined, {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </time>
              </div>
              <p className="mt-1.5 text-[9px] uppercase tracking-[0.13em] text-muted-foreground/80">
                {event.domain}
                {event.source ? ` · ${event.source}` : ''}
                {event.asOf
                  ? ` · as of ${new Date(event.asOf).toLocaleDateString(undefined, {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}`
                  : ''}
              </p>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

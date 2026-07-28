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
  AVAILABLE: 'border-[#5DC1A7]/30 bg-[#5DC1A7]/10 text-[#76D2BA]',
  PARTIAL: 'border-[#E6BC58]/30 bg-[#E6BC58]/10 text-[#E6BC58]',
  NO_DATA: 'border-[#8197B2]/20 bg-[#8197B2]/5 text-[#718096]',
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
            <p className="mb-1 text-[9px] font-medium uppercase tracking-[0.2em] text-[#718096]">
              {eyebrow}
            </p>
          )}
          <h2 className="text-sm font-semibold tracking-[-0.01em] text-[#ECE8DC]">{title}</h2>
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
  const toneColor =
    tone === 'positive'
      ? '#5DC1A7'
      : tone === 'attention'
        ? '#E57B69'
        : tone === 'comparison'
          ? '#79B8D8'
          : tone === 'primary'
            ? '#E6BC58'
            : '#ECE8DC'

  const Comp = onInspect ? 'button' : 'div'

  return (
    <Comp
      {...(onInspect ? { type: 'button' as const, onClick: onInspect } : {})}
      className={cn(
        'group relative min-h-[118px] overflow-hidden rounded-xl border border-[#8197B2]/20 bg-[#0D1521]/90 p-3 text-left shadow-[inset_0_1px_rgba(255,255,255,0.025)]',
        onInspect &&
          'transition-colors hover:border-[#E6BC58]/35 hover:bg-[#111C2A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E6BC58]/70'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-[#8D99AA]">
          {label}
        </p>
        <AvailabilityMark value={availability} compact />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <span
          className={cn('font-mono text-2xl leading-none tracking-[-0.04em]', styles.telemetry)}
          style={{ color: availability === 'NO_DATA' ? '#66758A' : toneColor }}
        >
          {availability === 'NO_DATA' ? '—' : value}
        </span>
        {comparisonValue && (
          <span className="font-mono text-xs text-[#79B8D8]">{comparisonValue}</span>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-[#718096]">
        {detail || (availability === 'NO_DATA' ? 'No source records available.' : 'Source verified.')}
      </p>
      {onInspect && (
        <ArrowRight className="absolute bottom-3 right-3 h-3 w-3 text-[#66758A] transition-transform group-hover:translate-x-0.5 group-hover:text-[#E6BC58]" />
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
        'flex h-full min-h-0 flex-col border-r border-[#8197B2]/20 bg-[#090F18]/95',
        className
      )}
    >
      <div className="border-b border-[#8197B2]/15 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[9px] uppercase tracking-[0.2em] text-[#718096]">Subject index</p>
            <p className="mt-0.5 font-mono text-xs text-[#ECE8DC]">
              {people.length} records · {departments} teams
            </p>
          </div>
          <Users className="h-4 w-4 text-[#E6BC58]" />
        </div>
        <label className="relative block">
          <span className="sr-only">Search employees</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#718096]" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Name, team, or role"
            className="h-9 border-[#8197B2]/25 bg-[#070B12] pl-8 pr-8 text-xs text-[#ECE8DC] placeholder:text-[#66758A] focus-visible:ring-[#E6BC58]/60"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#718096] hover:text-[#ECE8DC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E6BC58]"
              aria-label="Clear employee search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </label>
        <div className="mt-2 grid grid-cols-2 rounded-lg border border-[#8197B2]/20 bg-[#070B12] p-0.5">
          {(['ACTIVE', 'ARCHIVED'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onStatusChange(value)}
              aria-pressed={status === value}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E6BC58]',
                status === value
                  ? 'bg-[#182233] text-[#ECE8DC]'
                  : 'text-[#66758A] hover:text-[#B5BDCA]'
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
          <div className="px-3 py-10 text-center text-xs text-[#718096]">
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
                      'w-full rounded-lg border px-3 py-2.5 pr-10 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E6BC58]',
                      selected
                        ? 'border-[#E6BC58]/35 bg-[#E6BC58]/10'
                        : comparing
                          ? 'border-[#79B8D8]/30 bg-[#79B8D8]/10'
                          : 'border-transparent hover:border-[#8197B2]/15 hover:bg-[#111A28]'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'h-1.5 w-1.5 shrink-0 rounded-full',
                          selected
                            ? 'bg-[#E6BC58]'
                            : comparing
                              ? 'bg-[#79B8D8]'
                              : 'bg-[#4B586A]'
                        )}
                      />
                      <span className="truncate text-xs font-medium text-[#D9D7CF]">
                        {person.name}
                      </span>
                    </div>
                    <p className="mt-1 truncate pl-3.5 text-[9px] uppercase tracking-[0.08em] text-[#718096]">
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
                        'absolute right-2 top-1/2 -translate-y-1/2 rounded-md border p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#79B8D8]',
                        comparing
                          ? 'border-[#79B8D8]/40 bg-[#79B8D8]/15 text-[#79B8D8]'
                          : 'border-transparent text-[#66758A] hover:border-[#8197B2]/20 hover:bg-[#182233] hover:text-[#B5BDCA]'
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

function timelineTone(tone: CockpitTone | undefined) {
  if (tone === 'positive') return '#5DC1A7'
  if (tone === 'attention') return '#E57B69'
  if (tone === 'comparison') return '#79B8D8'
  if (tone === 'primary') return '#E6BC58'
  return '#8D99AA'
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
      <div className="rounded-lg border border-dashed border-[#8197B2]/20 bg-black/10 px-6 py-14 text-center text-sm text-[#8D99AA]">
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
              'rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E6BC58]',
              domain === item
                ? 'border-[#E6BC58]/40 bg-[#E6BC58]/10 text-[#E6BC58]'
                : 'border-[#8197B2]/20 text-[#718096] hover:text-[#B5BDCA]'
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
            <li key={event.id} className="relative rounded-lg px-3 py-3 hover:bg-white/[0.02]">
              <span
                className="absolute left-[-25px] top-3.5 flex h-[19px] w-[19px] items-center justify-center rounded-full border border-[#8197B2]/25 bg-[#0B111B]"
                style={{ color: timelineTone(event.tone) }}
              >
                <Icon className="h-2.5 w-2.5" />
              </span>
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div>
                  <p className="text-xs font-medium text-[#D9D7CF]">{event.title}</p>
                  {event.detail && (
                    <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[#8D99AA]">
                      {event.detail}
                    </p>
                  )}
                </div>
                <time className="shrink-0 font-mono text-[10px] text-[#718096]">
                  {new Date(event.date).toLocaleDateString(undefined, {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </time>
              </div>
              <p className="mt-1.5 text-[9px] uppercase tracking-[0.13em] text-[#586679]">
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

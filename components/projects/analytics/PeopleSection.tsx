'use client'

import Link from 'next/link'
import { CheckCircle2, Clock, Lock } from 'lucide-react'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { cn } from '@/lib/utils'
import type { Participant, PersonAnalytics } from './types'
import { NEUTRAL, categoricalColor, formatDay, plural } from './chart-theme'
import { ChartCard, ChartEmpty, MarkTip, SrTable } from './ChartCard'
import { StatTileGrid, type StatTileProps } from './StatTile'
import { ContributionHeatmap } from './ContributionHeatmap'

const RECENT_LIMIT = 8

function personTiles(person: PersonAnalytics): StatTileProps[] {
  const onTimeDefinition = 'Late work still counts as completed; this rate is separate.'
  return [
    { label: 'Owned', value: String(person.owned), sub: 'Completed as assignee, last 12 months', definition: 'Each completed task gives 1 to its assignee.' },
    { label: 'Helped', value: String(person.helped), sub: 'Completed as co-assignee', definition: 'Each co-assignee added before completion gets 1. Kept separate from Owned, never summed into a score.' },
    person.onTime
      ? {
        label: 'On time',
        value: `${Math.round((person.onTime.onTime / person.onTime.dated) * 100)}%`,
        sub: `${person.onTime.onTime} of ${person.onTime.dated} with a due date`,
        definition: onTimeDefinition,
      }
      : { label: 'On time', value: '–', sub: 'Needs 5 completed tasks with due dates', definition: onTimeDefinition },
    {
      label: 'Open now',
      value: String(person.openNow.owned + person.openNow.helping),
      sub: `${person.openNow.owned} owned · ${person.openNow.helping} helping`,
      definition: 'Open non-backlog tasks today, in projects you can open and elsewhere.',
    },
  ]
}

export function PersonPicker({ people, selectedId, onSelect }: { people: Participant[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <div role="group" aria-label="Person" className="flex flex-wrap gap-2">
      {people.map((person) => {
        const selected = person.id === selectedId
        return (
          <button
            key={person.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(person.id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'border-primary bg-primary/10 font-medium text-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground',
            )}
          >
            <UserAvatar name={person.name} size="xs" title="" />
            {person.name}
          </button>
        )
      })}
    </div>
  )
}

function ByProjectChart({ byProject }: { byProject: PersonAnalytics['byProject'] }) {
  // Real projects first by count, "Other" last; colour by that order, Other neutral.
  const rows = [...byProject].sort((a, b) => (a.projectId === null ? 1 : b.projectId === null ? -1 : b.count - a.count || a.name.localeCompare(b.name)))
  const max = Math.max(...rows.map((row) => row.count), 1)
  let slot = 0
  const colored = rows.map((row) => ({ ...row, color: row.projectId === null ? NEUTRAL : categoricalColor(slot++) }))

  return (
    <ChartCard
      id="by-project"
      title="Completed by project"
      description="Shows work spread across projects, not only this one. Projects you can't open are grouped as Other."
    >
      {rows.length === 0 ? (
        <ChartEmpty title="Nothing completed yet" description="Tasks completed in the last 12 months show here by project." />
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {colored.map((row) => (
              <li key={row.projectId ?? 'other'}>
                <MarkTip title={row.name} rows={[{ label: 'Completed', value: row.count, color: row.color, kind: 'rect' }]}>
                  <div
                    tabIndex={0}
                    aria-label={`${row.name}: ${plural(row.count, 'task')}`}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_32px] items-center gap-3 rounded-md px-1 py-1.5 text-[13px] transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: row.color }} />
                      <span className="truncate text-foreground">{row.name}</span>
                    </span>
                    <span className="flex h-3">
                      <span className="block h-full rounded" style={{ width: `${(row.count / max) * 100}%`, background: row.color }} />
                    </span>
                    <span className="text-right font-medium tabular-nums text-foreground">{row.count}</span>
                  </div>
                </MarkTip>
              </li>
            ))}
          </ul>
          <SrTable caption="Completed by project, last 12 months" headers={['Project', 'Completed']} rows={rows.map((row) => [row.name, row.count])} />
        </>
      )}
    </ChartCard>
  )
}

function RecentList({ recent }: { recent: PersonAnalytics['recent'] }) {
  const items = recent.slice(0, RECENT_LIMIT)
  return (
    <ChartCard id="recent" title="Recently completed">
      {items.length === 0 ? (
        <ChartEmpty title="Nothing completed yet" description="Tasks this person finishes in projects you can open show here." />
      ) : (
        <ul className="-mt-1 flex flex-col">
          {items.map((task) => (
            <li key={task.id} className="flex items-center gap-2.5 border-b border-border py-2 text-[13px] last:border-0 sm:gap-3">
              <Link
                href={`/projects/${task.projectId}?task=${encodeURIComponent(task.id)}`}
                title={task.projectName ? `${task.title} · ${task.projectName}` : task.title}
                className="min-w-0 flex-1 truncate rounded text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {task.title}
              </Link>
              <span className="shrink-0 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                {task.role === 'owner' ? 'Owner' : 'Helper'}
              </span>
              <span
                className={cn(
                  'inline-flex w-[64px] shrink-0 items-center gap-1 text-[11px]',
                  task.late ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400',
                )}
              >
                {task.late ? <Clock aria-hidden="true" className="h-3 w-3" /> : <CheckCircle2 aria-hidden="true" className="h-3 w-3" />}
                {task.late ? 'Late' : 'On time'}
              </span>
              <time dateTime={task.completedOn} className="w-[48px] shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {formatDay(task.completedOn)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  )
}

interface PeopleSectionProps {
  people: Participant[]
  selected: Participant
  person: PersonAnalytics
  onSelect: (id: string) => void
}

export function PeopleSection({ people, selected, person, onSelect }: PeopleSectionProps) {
  const firstName = selected.name.split(' ')[0] || selected.name
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PersonPicker people={people} selectedId={selected.id} onSelect={onSelect} />
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock aria-hidden="true" className="h-3.5 w-3.5" />
          Visible to this project&apos;s leads and HR
        </span>
      </div>
      <StatTileGrid tiles={personTiles(person)} />
      <ContributionHeatmap heatmap={person.heatmap} firstName={firstName} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ByProjectChart byProject={person.byProject} />
        <RecentList recent={person.recent} />
      </div>
      <p className="text-xs text-muted-foreground">
        Counts completed tasks only. It doesn&apos;t reflect task size, difficulty or work outside Compass, and there is no ranking between people.
      </p>
    </div>
  )
}

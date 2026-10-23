'use client'

import type { AnalyticsRange } from '@/lib/project-analytics'
import type { DoneSectionIds, Participant, ProjectAnalytics } from './types'
import { CATEGORICAL, NEUTRAL, PRIORITY_COLOR, PRIORITY_LABEL, categoricalColor, plural } from './chart-theme'
import { StatTileGrid, type StatTileProps } from './StatTile'
import { BurnUpChart } from './BurnUpChart'
import { ThroughputChart } from './ThroughputChart'
import { AgingChart } from './AgingChart'
import { DonutCard, type DonutSegment } from './DonutCard'
import { WorkloadChart } from './WorkloadChart'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_SLICES = 6

function previousLabel(range: AnalyticsRange) {
  if (range.key === '30d') return 'previous 30 days'
  if (range.key === '90d') return 'previous 90 days'
  if (range.key === '6m') return 'previous 6 months'
  if (range.key === '12m') return 'previous 12 months'
  const days = Math.round((Date.parse(range.to) - Date.parse(range.from)) / DAY_MS) + 1
  return `previous ${plural(days, 'day')}`
}

function overviewTiles(analytics: ProjectAnalytics, range: AnalyticsRange): StatTileProps[] {
  const { progress, completed, onTime, overdue } = analytics.tiles
  const delta = completed.inRange - completed.previous
  return [
    {
      label: 'Progress',
      value: `${progress.percentage}%`,
      unit: `${progress.completed} of ${plural(progress.total, 'task')}`,
      sub: 'Backlog is not counted',
      definition: 'Completed non-backlog tasks divided by all non-backlog tasks.',
    },
    {
      label: 'Completed',
      value: String(completed.inRange),
      unit: completed.inRange === 1 ? 'task' : 'tasks',
      sub: `${delta >= 0 ? '+' : ''}${delta} vs ${previousLabel(range)}`,
      definition: 'Tasks marked done in the selected range.',
    },
    onTime
      ? {
        label: 'On time',
        value: `${Math.round((onTime.onTime / onTime.dated) * 100)}%`,
        unit: `${onTime.onTime} of ${onTime.dated} with a due date`,
        sub: 'Tasks without a due date are left out',
        definition: 'Completed on or before the due date, out of completed tasks that had a due date.',
      }
      : {
        label: 'On time',
        value: '–',
        sub: 'Needs 5 completed tasks with due dates',
        definition: 'Completed on or before the due date, out of completed tasks that had a due date.',
      },
    {
      label: 'Overdue now',
      value: String(overdue.count),
      unit: 'open tasks',
      sub: overdue.count > 0 ? `Oldest is ${plural(overdue.oldestDaysLate, 'day')} late` : 'Nothing is past due',
      definition: 'Open non-backlog tasks whose due date has passed.',
    },
  ]
}

/** Keep a donut to six slices; the rest fold into one neutral slice. */
function fold(segments: DonutSegment[], label: string): DonutSegment[] {
  if (segments.length <= MAX_SLICES) return segments
  const kept = segments.slice(0, MAX_SLICES - 1)
  const rest = segments.slice(MAX_SLICES - 1).reduce((sum, segment) => sum + segment.count, 0)
  return [...kept, { key: 'other', label, count: rest, color: NEUTRAL }]
}

interface OverviewSectionProps {
  analytics: ProjectAnalytics
  range: AnalyticsRange
  participants: Participant[]
  doneSections: DoneSectionIds
}

export function OverviewSection({ analytics, range, participants, doneSections }: OverviewSectionProps) {
  // Not-started columns read neutral, done reads teal, the rest take the remaining slots in order.
  const openSlots = [NEUTRAL, CATEGORICAL[0], CATEGORICAL[2], CATEGORICAL[3], CATEGORICAL[4], CATEGORICAL[5]]
  let openIndex = 0
  const status = fold(analytics.status.map((section) => ({
    key: section.sectionId,
    label: section.name,
    count: section.count,
    color: doneSections.has(section.sectionId) ? CATEGORICAL[1] : openSlots[openIndex++] ?? NEUTRAL,
  })), 'Other columns')

  const priority = analytics.priority.map((entry) => ({
    key: entry.priority,
    label: PRIORITY_LABEL[entry.priority] ?? entry.priority,
    count: entry.count,
    color: PRIORITY_COLOR[entry.priority] ?? NEUTRAL,
  }))

  // Colour follows the person (their place in the name-sorted roster), never their count.
  const slot = new Map(participants.map((person, index) => [person.id, index]))
  const contribution = analytics.contribution.map((entry) => {
    const index = slot.get(entry.userId)
    return { key: entry.userId, label: entry.name, count: entry.count, color: index === undefined ? NEUTRAL : categoricalColor(index) }
  })
  const named = contribution.filter((entry) => entry.color !== NEUTRAL)
  const others = contribution.filter((entry) => entry.color === NEUTRAL)
  const contributionSegments = others.length === 0 ? named : [
    ...named,
    { key: 'others', label: 'Everyone else', count: others.reduce((sum, entry) => sum + entry.count, 0), color: NEUTRAL },
  ]

  return (
    <div className="flex flex-col gap-4">
      <StatTileGrid tiles={overviewTiles(analytics, range)} />
      <BurnUpChart burnUp={analytics.burnUp} range={range} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ThroughputChart throughput={analytics.throughput} range={range} />
        <AgingChart aging={analytics.aging} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DonutCard
          id="status"
          title="Where tasks are now"
          description="Every non-backlog task in this project, by board column."
          centerLabel="tasks"
          segments={status}
          empty={{ title: 'No tasks yet', description: 'Tasks outside the backlog show here by column.' }}
        />
        <DonutCard
          id="priority"
          title="Open tasks by priority"
          description="What is still open, and how urgent it is."
          centerLabel="open"
          segments={priority}
          empty={{ title: 'No open tasks', description: 'Everything outside the backlog is done.' }}
        />
        <DonutCard
          id="contribution"
          title="Contribution by person"
          description="Tasks completed in the selected range, credited to the assignee. Co-assignee help is in People."
          centerLabel="completed"
          segments={contributionSegments}
          empty={{ title: 'Nothing completed in this range', description: 'Completed tasks with an assignee show here.' }}
        />
      </div>
      <WorkloadChart workload={analytics.workload} />
    </div>
  )
}

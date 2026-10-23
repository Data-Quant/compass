'use client'

import { CalendarRange, ChevronDown, Clock3, Pencil, Plus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import {
  formatSprintDay,
  formatSprintRange,
  getSprintStatus,
  sprintDateKey,
  sprintDaysLeft,
  type SprintStatus,
} from '@/lib/project-sprints'

export interface ProjectSprint {
  id: string
  name: string
  startDate: string
  endDate: string
  completedAt: string | null
}

/** 'all', 'none' (tasks without a sprint) or a sprint id. */
export type SprintFilter = string

export interface SprintStats {
  total: number
  done: number
  unfinished: number
}

type SprintTask = {
  status: string
  sprintId?: string | null
  section?: { isBacklog?: boolean | null } | null
}

// Backlog tasks are left out of sprint progress, like the sprints API does.
export function sprintStats(tasks: SprintTask[], sprintId: string): SprintStats {
  const inSprint = tasks.filter((task) => task.sprintId === sprintId && !task.section?.isBacklog)
  const done = inSprint.filter((task) => task.status === 'DONE').length
  return { total: inSprint.length, done, unfinished: inSprint.length - done }
}

export function filterTasksBySprint<T extends { sprintId?: string | null }>(tasks: T[], filter: SprintFilter) {
  if (filter === 'all') return tasks
  const sprintId = filter === 'none' ? null : filter
  return tasks.filter((task) => (task.sprintId ?? null) === sprintId)
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

function daysLeftLabel(endDate: string) {
  const days = sprintDaysLeft(endDate)
  return days <= 0 ? 'last day' : `${plural(days, 'day')} left`
}

function sprintMeta(sprint: ProjectSprint, status: SprintStatus, stats: SprintStats) {
  if (status === 'current') return `${stats.done} of ${stats.total} done · ${daysLeftLabel(sprint.endDate)}`
  if (status === 'upcoming') return `Starts ${formatSprintDay(sprint.startDate)} · ${plural(stats.total, 'task')}`
  if (status === 'past') return 'Ended · not completed yet'
  return `Completed · ${stats.done} of ${stats.total} done`
}

function sprintSummary(sprint: ProjectSprint, status: SprintStatus, stats: SprintStats) {
  if (status === 'current') return `${stats.done} of ${stats.total} done · ${daysLeftLabel(sprint.endDate)}`
  if (status === 'upcoming') {
    return stats.total === 0 ? 'Planned · no tasks yet' : `Starts ${formatSprintDay(sprint.startDate)} · ${plural(stats.total, 'task')}`
  }
  if (status === 'past') return `${stats.done} of ${stats.total} done · ended ${formatSprintDay(sprint.endDate)}`
  return `Completed · ${stats.done} of ${stats.total} done`
}

const GROUPS: Array<{ label: string; statuses: SprintStatus[] }> = [
  { label: 'Current', statuses: ['current'] },
  { label: 'Upcoming', statuses: ['upcoming'] },
  { label: 'Past', statuses: ['past', 'completed'] },
]

const ITEM_CLASS = 'flex-col items-start gap-0.5 rounded-md py-2 pr-2.5 focus:bg-muted focus:text-foreground data-[state=checked]:bg-muted/70 data-[state=checked]:font-medium'

interface SprintPickerProps {
  sprints: ProjectSprint[]
  tasks: SprintTask[]
  value: SprintFilter
  totalTaskCount: number
  canManage: boolean
  onChange: (value: SprintFilter) => void
  onNewSprint: () => void
  onEditSprint: (sprint: ProjectSprint) => void
}

export function SprintPicker({ sprints, tasks, value, totalTaskCount, canManage, onChange, onNewSprint, onEditSprint }: SprintPickerProps) {
  const rows = sprints.map((sprint) => ({ sprint, status: getSprintStatus(sprint), stats: sprintStats(tasks, sprint.id) }))
  const selected = rows.find((row) => row.sprint.id === value)
  const noSprintCount = tasks.filter((task) => !task.sprintId).length

  const triggerName = selected ? selected.sprint.name : value === 'none' ? 'No sprint' : 'All tasks'
  const summary = selected
    ? sprintSummary(selected.sprint, selected.status, selected.stats)
    : plural(value === 'none' ? noSprintCount : totalTaskCount, 'task')

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Sprint: ${triggerName}`}
            className="inline-flex h-[34px] max-w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted/50"
          >
            <CalendarRange className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate font-medium">{triggerName}</span>
            {selected && (
              <span className="hidden shrink-0 tabular-nums text-muted-foreground sm:inline">{formatSprintRange(selected.sprint)}</span>
            )}
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[min(320px,calc(100vw-32px))] rounded-xl p-1.5">
          <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
            {GROUPS.map((group) => {
              const items = rows
                .filter((row) => group.statuses.includes(row.status))
                .sort((a, b) => (group.label === 'Past' ? -1 : 1) * (sprintDateKey(a.sprint.startDate) - sprintDateKey(b.sprint.startDate)))
              if (items.length === 0) return null
              return (
                <div key={group.label} role="group" aria-label={group.label}>
                  <DropdownMenuLabel className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </DropdownMenuLabel>
                  {items.map(({ sprint, status, stats }) => (
                    <DropdownMenuRadioItem key={sprint.id} value={sprint.id} className={ITEM_CLASS}>
                      <span className="max-w-full truncate">
                        {sprint.name}
                        <span className="font-normal text-muted-foreground"> · {formatSprintRange(sprint)}</span>
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">{sprintMeta(sprint, status, stats)}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </div>
              )
            })}
            <div role="group" aria-label="Other">
              <DropdownMenuLabel className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Other
              </DropdownMenuLabel>
              <DropdownMenuRadioItem value="all" className={ITEM_CLASS}>
                <span>All tasks</span>
                <span className="text-xs font-normal text-muted-foreground">Every task, as today</span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="none" className={ITEM_CLASS}>
                <span>No sprint</span>
                <span className="text-xs font-normal text-muted-foreground">Tasks not planned into a sprint</span>
              </DropdownMenuRadioItem>
            </div>
          </DropdownMenuRadioGroup>
          {canManage && (
            <>
              <DropdownMenuSeparator className="my-1.5" />
              {selected && selected.status !== 'completed' && (
                <DropdownMenuItem onSelect={() => onEditSprint(selected.sprint)} className="rounded-md px-2.5 py-2 focus:bg-muted focus:text-foreground">
                  <Pencil aria-hidden="true" />
                  Edit {selected.sprint.name}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={onNewSprint} className="rounded-md px-2.5 py-2 font-medium text-primary focus:bg-muted focus:text-primary">
                <Plus aria-hidden="true" />
                New sprint
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">{summary}</span>
    </div>
  )
}

interface SprintReviewBannerProps {
  sprint: ProjectSprint
  unfinished: number
  canManage: boolean
  onReview: () => void
}

export function SprintReviewBanner({ sprint, unfinished, canManage, onReview }: SprintReviewBannerProps) {
  const leftover = unfinished === 0 ? 'no unfinished tasks' : `${plural(unfinished, 'unfinished task')}`
  return (
    <div
      role="status"
      className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
    >
      <p className="flex items-start gap-2 text-sm">
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <span>
          {sprint.name} ended on {formatSprintDay(sprint.endDate)} with {leftover}. Nothing moves until a lead reviews it.
        </span>
      </p>
      {canManage && (
        <Button size="sm" className="shrink-0 self-start sm:self-auto" onClick={onReview}>
          Review and complete {sprint.name}
        </Button>
      )}
    </div>
  )
}

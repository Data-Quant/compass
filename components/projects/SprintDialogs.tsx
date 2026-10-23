'use client'

import { useEffect, useId, useState } from 'react'
import { CalendarIcon, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  SPRINT_PRESET_LENGTHS,
  addSprintDays,
  defaultCompletionTargetId,
  formatSprintDate,
  formatSprintDay,
  formatSprintRange,
  getSprintStatus,
  sprintSpanDays,
  validateSprintInput,
} from '@/lib/project-sprints'
import { toLocalDateValue } from './workspace-utils'
import type { ProjectSprint, SprintStats } from './SprintPicker'

const DIALOG_CLASS = 'w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border-border bg-card p-5 sm:p-6'

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>
  } catch {
    return {}
  }
}

const errorFrom = (data: Record<string, unknown>, fallback: string) =>
  typeof data.error === 'string' && data.error ? data.error : fallback

/* ─── Date field ──────────────────────────────────────────────────────── */

// YYYY-MM-DD to a local-noon Date, so the calendar shows the same day in every timezone.
function toPickerDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

function DateField({ id, label, value, min, disabled, describedBy, onChange }: {
  id: string
  label: string
  value: string
  min?: string
  disabled?: boolean
  describedBy?: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            aria-describedby={describedBy}
            className="flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-left text-sm tabular-nums shadow-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground disabled:hover:bg-muted/40"
          >
            <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{formatSprintDay(value)}, {value.slice(0, 4)}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="z-[80] w-auto p-0">
          <Calendar
            mode="single"
            selected={toPickerDate(value)}
            defaultMonth={toPickerDate(value)}
            disabled={min ? { before: toPickerDate(min) } : undefined}
            onSelect={(date) => {
              if (!date) return
              onChange(toLocalDateValue(date))
              setOpen(false)
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

/* ─── New / Edit sprint ───────────────────────────────────────────────── */

type SprintLength = (typeof SPRINT_PRESET_LENGTHS)[number] | 'custom'

const LENGTH_OPTIONS: Array<{ value: SprintLength; label: string }> = [
  { value: 7, label: '1 week' },
  { value: 14, label: '2 weeks' },
  { value: 21, label: '3 weeks' },
  { value: 28, label: '4 weeks' },
  { value: 'custom', label: 'Custom dates' },
]

interface SprintFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  /** Present in edit mode. */
  sprint?: ProjectSprint | null
  sprintTaskCount?: number
  suggestedName: string
  suggestedStart: string
  onSaved: (sprintId: string) => void | Promise<void>
  onDeleted: (sprintId: string) => void | Promise<void>
}

export function SprintFormDialog({
  open, onOpenChange, projectId, sprint, sprintTaskCount = 0, suggestedName, suggestedStart, onSaved, onDeleted,
}: SprintFormDialogProps) {
  const ids = useId()
  const [name, setName] = useState('')
  const [length, setLength] = useState<SprintLength>(14)
  const [start, setStart] = useState(suggestedStart)
  const [customEnd, setCustomEnd] = useState(suggestedStart)
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) return
    const startDate = sprint ? formatSprintDate(sprint.startDate) : suggestedStart
    const endDate = sprint ? formatSprintDate(sprint.endDate) : addSprintDays(suggestedStart, 13)
    const span = sprintSpanDays(startDate, endDate)
    setName(sprint ? sprint.name : suggestedName)
    setStart(startDate)
    setCustomEnd(endDate)
    setLength((SPRINT_PRESET_LENGTHS as readonly number[]).includes(span) ? span as SprintLength : sprint ? 'custom' : 14)
    setSubmitted(false)
    setServerError(null)
    setConfirmingDelete(false)
  }, [open, sprint, suggestedName, suggestedStart])

  const end = length === 'custom' ? customEnd : addSprintDays(start, length - 1)
  const span = sprintSpanDays(start, end)
  const nameError = !name.trim() ? 'Give the sprint a name' : null
  const parsed = validateSprintInput({ name: name.trim() || 'x', startDate: start, endDate: end, length })
  const dateError = parsed.ok ? null : parsed.error === 'endDate cannot be before startDate' ? 'The end date cannot be before the start date' : parsed.error
  const hint = length === 'custom'
    ? `Pick any end date. ${formatSprintDay(start)} – ${formatSprintDay(end)} is ${span} ${span === 1 ? 'day' : 'days'}.`
    : `Ends ${formatSprintDay(end)}. Choose Custom dates to set the end yourself.`

  const pickLength = (next: SprintLength) => {
    if (next === 'custom') setCustomEnd(end)
    setLength(next)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    setServerError(null)
    if (nameError || dateError || saving) {
      if (nameError) document.getElementById(`${ids}-name`)?.focus()
      return
    }
    setSaving(true)
    try {
      const response = await fetch(sprint ? `/api/projects/${projectId}/sprints/${sprint.id}` : `/api/projects/${projectId}/sprints`, {
        method: sprint ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), startDate: start, endDate: end, length }),
      })
      const data = await readJson(response)
      if (!response.ok || data.success !== true) throw new Error(errorFrom(data, sprint ? 'Failed to save the sprint' : 'Failed to create the sprint'))
      const saved = data.sprint as { id: string; name: string }
      toast.success(sprint ? `${saved.name} updated` : `${saved.name} created`)
      onOpenChange(false)
      await onSaved(saved.id)
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Failed to save the sprint')
    } finally {
      setSaving(false)
    }
  }

  const deleteSprint = async () => {
    if (!sprint || saving) return
    setSaving(true)
    try {
      const response = await fetch(`/api/projects/${projectId}/sprints/${sprint.id}`, { method: 'DELETE' })
      const data = await readJson(response)
      if (!response.ok || data.success !== true) throw new Error(errorFrom(data, 'Failed to delete the sprint'))
      toast.success(`${sprint.name} deleted`)
      onOpenChange(false)
      await onDeleted(sprint.id)
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Failed to delete the sprint')
    } finally {
      setSaving(false)
    }
  }

  const hintId = `${ids}-hint`
  const dateErrorId = `${ids}-date-error`
  const showDateError = submitted && dateError

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className={cn(DIALOG_CLASS, 'max-w-[480px]')}>
        <DialogHeader className="text-left">
          <DialogTitle className="text-[17px]">{sprint ? `Edit ${sprint.name}` : 'New sprint'}</DialogTitle>
          <DialogDescription>Tasks are added to a sprint by hand, from the board or the task panel.</DialogDescription>
        </DialogHeader>

        {confirmingDelete && sprint ? (
          <div className="flex flex-col gap-4">
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-foreground">Delete {sprint.name}?</p>
              <p className="mt-1 text-muted-foreground">
                {sprintTaskCount === 0
                  ? 'It has no tasks. Nothing else changes.'
                  : `Its ${sprintTaskCount === 1 ? 'task moves' : `${sprintTaskCount} tasks move`} to No sprint. The tasks themselves are kept.`}
              </p>
            </div>
            {serverError && <p role="alert" className="text-sm text-destructive">{serverError}</p>}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setConfirmingDelete(false)}>Keep sprint</Button>
              <Button type="button" variant="destructive" disabled={saving} onClick={() => void deleteSprint()}>
                {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
                Delete sprint
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-name`}>Name</Label>
              <Input
                id={`${ids}-name`}
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={Boolean(submitted && nameError)}
                aria-describedby={submitted && nameError ? `${ids}-name-error` : undefined}
                className="aria-[invalid=true]:border-destructive"
              />
              {submitted && nameError && <p id={`${ids}-name-error`} className="text-xs text-destructive">{nameError}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <span id={`${ids}-length`} className="text-sm font-medium leading-none">Length</span>
              <div role="group" aria-labelledby={`${ids}-length`} className="flex flex-wrap gap-1.5">
                {LENGTH_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={length === option.value}
                    onClick={() => pickLength(option.value)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      length === option.value
                        ? 'border-primary bg-primary/10 font-medium text-foreground'
                        : 'border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <DateField
                id={`${ids}-start`}
                label="Starts"
                value={start}
                describedBy={hintId}
                onChange={(value) => {
                  setStart(value)
                  if (length === 'custom' && customEnd < value) setCustomEnd(value)
                }}
              />
              <DateField
                id={`${ids}-end`}
                label="Ends"
                value={end}
                min={start}
                disabled={length !== 'custom'}
                describedBy={showDateError ? `${hintId} ${dateErrorId}` : hintId}
                onChange={setCustomEnd}
              />
            </div>
            <p id={hintId} className="-mt-1 text-xs text-muted-foreground">{hint}</p>
            {showDateError && <p id={dateErrorId} role="alert" className="-mt-2 text-xs text-destructive">{dateError}</p>}
            {serverError && <p role="alert" className="text-sm text-destructive">{serverError}</p>}

            <DialogFooter className="gap-2 sm:items-center sm:gap-0">
              {sprint && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto"
                  onClick={() => { setServerError(null); setConfirmingDelete(true) }}
                >
                  Delete sprint
                </Button>
              )}
              <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
                {sprint ? 'Save changes' : 'Create sprint'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ─── Complete sprint ─────────────────────────────────────────────────── */

export interface UnfinishedSprintTask {
  id: string
  title: string
  assignee: { name: string } | null
  section: { name: string } | null
}

interface CompleteSprintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  sprint: ProjectSprint
  sprints: ProjectSprint[]
  stats: SprintStats
  unfinishedTasks: UnfinishedSprintTask[]
  onCompleted: () => void | Promise<void>
}

const statusSuffix = (sprint: ProjectSprint) => {
  const status = getSprintStatus(sprint)
  return status === 'current' ? ' (current)' : status === 'upcoming' ? ' (upcoming)' : ' (ended)'
}

export function CompleteSprintDialog({
  open, onOpenChange, projectId, sprint, sprints, stats, unfinishedTasks, onCompleted,
}: CompleteSprintDialogProps) {
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const targets = sprints.filter((candidate) => candidate.id !== sprint.id && !candidate.completedAt)

  // Fresh defaults each time it opens: the current sprint, else the next one, else No sprint.
  useEffect(() => {
    if (!open) return
    const fallback = defaultCompletionTargetId(sprints, sprint.id) || 'none'
    setChoices(Object.fromEntries(unfinishedTasks.map((task) => [task.id, fallback])))
    setError(null)
    // Only on open: the task list refreshing underneath must not reset choices mid-review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sprint.id])

  const choiceFor = (taskId: string) => choices[taskId] || 'none'
  const counts = new Map<string, number>()
  for (const task of unfinishedTasks) counts.set(choiceFor(task.id), (counts.get(choiceFor(task.id)) || 0) + 1)
  const parts = [...counts].map(([choice, count]) => {
    if (choice === 'keep') return `${count} stay in ${sprint.name}`
    if (choice === 'none') return `${count} to No sprint`
    return `${count} to ${sprints.find((candidate) => candidate.id === choice)?.name || 'another sprint'}`
  })
  const summary = `${parts.length > 0 ? `On confirm: ${parts.join(', ')}. ` : ''}Completed tasks stay in ${sprint.name} for history and analytics.`

  const complete = async () => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const actions = unfinishedTasks.map((task) => {
        const choice = choiceFor(task.id)
        if (choice === 'keep' || choice === 'none') return { taskId: task.id, action: choice }
        return { taskId: task.id, action: 'move', targetSprintId: choice }
      })
      const response = await fetch(`/api/projects/${projectId}/sprints/${sprint.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions }),
      })
      const data = await readJson(response)
      if (!response.ok || data.success !== true) throw new Error(errorFrom(data, 'Failed to complete the sprint'))
      toast.success(`${sprint.name} completed`)
      onOpenChange(false)
      await onCompleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete the sprint')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className={cn(DIALOG_CLASS, 'max-w-[600px]')}>
        <DialogHeader className="text-left">
          <DialogTitle className="text-[17px]">Complete {sprint.name}</DialogTitle>
          <DialogDescription>
            {formatSprintRange(sprint)} · {stats.done} of {stats.total} tasks done.{' '}
            {unfinishedTasks.length > 0
              ? 'Choose what happens to each unfinished task. Nothing changes until you confirm.'
              : 'Every task is done. Nothing changes until you confirm.'}
          </DialogDescription>
        </DialogHeader>

        {unfinishedTasks.length > 0 && (
          <ul className="max-h-[45vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {unfinishedTasks.map((task) => (
              <li key={task.id} className="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{task.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {task.assignee?.name || 'Unassigned'}{task.section ? ` · ${task.section.name}` : ''}
                  </span>
                </div>
                <Select value={choiceFor(task.id)} onValueChange={(value) => setChoices((current) => ({ ...current, [task.id]: value }))}>
                  <SelectTrigger aria-label={`What happens to ${task.title}`} className="h-9 w-full shrink-0 rounded-lg bg-card text-[13px] sm:w-60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[80]">
                    {targets.map((target) => (
                      <SelectItem key={target.id} value={target.id}>Move to {target.name}{statusSuffix(target)}</SelectItem>
                    ))}
                    <SelectItem value="none">Move to No sprint</SelectItem>
                    <SelectItem value="keep">Leave in {sprint.name}</SelectItem>
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground" aria-live="polite">{summary}</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Not now</Button>
          <Button type="button" disabled={saving} onClick={() => void complete()}>
            {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
            Complete sprint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

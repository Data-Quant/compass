import { projectTaskCalendarDayKey } from '@/lib/project-progress'

const DAY_MS = 24 * 60 * 60 * 1000

export const SPRINT_NAME_MAX_LENGTH = 80
export const SPRINT_MAX_DAYS = 56
export const SPRINT_PRESET_LENGTHS = [7, 14, 21, 28] as const
export const SPRINT_MAX_COMPLETION_ACTIONS = 500
export const SPRINT_COMPLETION_ACTIONS = ['move', 'none', 'keep'] as const

export type SprintStatus = 'current' | 'upcoming' | 'past' | 'completed'
export type SprintCompletionActionKind = (typeof SPRINT_COMPLETION_ACTIONS)[number]
export type SprintCompletionAction = {
  taskId: string
  action: SprintCompletionActionKind
  targetSprintId?: string
}

export type SprintDates = {
  startDate: Date | string
  endDate: Date | string
  completedAt?: Date | string | null
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// Same cuid check as lib/project-access, copied so this file stays client-safe (no prisma import).
function isProjectRecordId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9]{20,40}$/i.test(value)
}

// Sprint dates are calendar days stored as UTC midnight, so their day key is the UTC date.
export function parseSprintDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.length !== 10 || !DATE_PATTERN.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null
  return date
}

export function sprintDateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function formatSprintDate(value: Date | string) {
  return new Date(sprintDateKey(value)).toISOString().slice(0, 10)
}

/**
 * Validates a sprint create/update payload. `length` is 7/14/21/28 (end is
 * computed from start) or 'custom'/absent (endDate required).
 */
export function validateSprintInput(input: unknown): Result<{ name: string; startDate: Date; endDate: Date }> {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Invalid sprint payload' }
  const { name, startDate, endDate, length } = input as Record<string, unknown>

  if (typeof name !== 'string') return { ok: false, error: 'Sprint name is required' }
  const trimmedName = name.trim()
  if (!trimmedName) return { ok: false, error: 'Sprint name is required' }
  if (trimmedName.length > SPRINT_NAME_MAX_LENGTH) {
    return { ok: false, error: `Sprint name must be ${SPRINT_NAME_MAX_LENGTH} characters or fewer` }
  }

  const start = parseSprintDate(startDate)
  if (!start) return { ok: false, error: 'startDate must be YYYY-MM-DD' }

  let end: Date | null
  if (length === undefined || length === null || length === 'custom') {
    end = parseSprintDate(endDate)
    if (!end) return { ok: false, error: 'endDate must be YYYY-MM-DD' }
  } else if (typeof length === 'number' && (SPRINT_PRESET_LENGTHS as readonly number[]).includes(length)) {
    end = new Date(start.getTime() + (length - 1) * DAY_MS)
  } else {
    return { ok: false, error: 'length must be 7, 14, 21, 28 or custom' }
  }

  if (end.getTime() < start.getTime()) return { ok: false, error: 'endDate cannot be before startDate' }
  if ((end.getTime() - start.getTime()) / DAY_MS + 1 > SPRINT_MAX_DAYS) {
    return { ok: false, error: 'A sprint can be at most 8 weeks long' }
  }

  return { ok: true, value: { name: trimmedName, startDate: start, endDate: end } }
}

export function getSprintStatus(sprint: SprintDates, now = new Date()): SprintStatus {
  if (sprint.completedAt) return 'completed'
  const today = projectTaskCalendarDayKey(now) ?? sprintDateKey(now)
  if (today < sprintDateKey(sprint.startDate)) return 'upcoming'
  if (today > sprintDateKey(sprint.endDate)) return 'past'
  return 'current'
}

/** Ended but not completed: the UI shows the "needs review" banner. Nothing changes until a manager completes it. */
export function sprintNeedsReview(sprint: SprintDates, now = new Date()) {
  return getSprintStatus(sprint, now) === 'past'
}

export function pickDefaultSprint<T extends SprintDates & { id: string }>(sprints: T[], now = new Date()): T | null {
  return [...sprints]
    .sort((a, b) => sprintDateKey(a.startDate) - sprintDateKey(b.startDate))
    .find((sprint) => getSprintStatus(sprint, now) === 'current') || null
}

/**
 * Every unfinished task in the sprint needs exactly one action; moves must
 * target another non-completed sprint of the same project (`projectSprints`).
 */
export function validateSprintCompletionPlan(input: {
  sprintId: string
  actions: unknown
  unfinishedTaskIds: string[]
  projectSprints: Array<{ id: string; completedAt?: Date | string | null }>
}): Result<SprintCompletionAction[]> {
  const { sprintId, actions, unfinishedTaskIds, projectSprints } = input
  if (!Array.isArray(actions)) return { ok: false, error: 'actions must be an array' }
  if (actions.length > SPRINT_MAX_COMPLETION_ACTIONS) {
    return { ok: false, error: `At most ${SPRINT_MAX_COMPLETION_ACTIONS} actions are allowed` }
  }

  const expected = new Set(unfinishedTaskIds)
  const seen = new Set<string>()
  const openTargets = new Set(projectSprints.filter((s) => s.id !== sprintId && !s.completedAt).map((s) => s.id))
  const clean: SprintCompletionAction[] = []

  for (const raw of actions) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid action' }
    const { taskId, action, targetSprintId } = raw as Record<string, unknown>
    if (!isProjectRecordId(taskId) || !expected.has(taskId)) {
      return { ok: false, error: 'Each action must name an unfinished task in this sprint' }
    }
    if (seen.has(taskId)) return { ok: false, error: 'Each task can have only one action' }
    seen.add(taskId)
    if (typeof action !== 'string' || !(SPRINT_COMPLETION_ACTIONS as readonly string[]).includes(action)) {
      return { ok: false, error: 'action must be move, none or keep' }
    }
    if (action === 'move') {
      if (!isProjectRecordId(targetSprintId) || !openTargets.has(targetSprintId)) {
        return { ok: false, error: 'Move target must be another open sprint in this project' }
      }
      clean.push({ taskId, action, targetSprintId })
    } else {
      clean.push({ taskId, action: action as SprintCompletionActionKind })
    }
  }

  if (seen.size !== expected.size) return { ok: false, error: 'Every unfinished task needs an action' }
  return { ok: true, value: clean }
}

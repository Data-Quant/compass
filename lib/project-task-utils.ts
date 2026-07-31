import { projectTaskCalendarDayKey } from '@/lib/project-progress'

export const PROJECT_TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const
export const PROJECT_TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const

export type ProjectTaskStatus = (typeof PROJECT_TASK_STATUSES)[number]
export type ProjectTaskPriority = (typeof PROJECT_TASK_PRIORITIES)[number]

export function isProjectTaskStatus(value: unknown): value is ProjectTaskStatus {
  return (
    typeof value === 'string' &&
    (PROJECT_TASK_STATUSES as readonly string[]).includes(value)
  )
}

export function isProjectTaskPriority(value: unknown): value is ProjectTaskPriority {
  return (
    typeof value === 'string' &&
    (PROJECT_TASK_PRIORITIES as readonly string[]).includes(value)
  )
}

export function shiftProjectTaskDateByCalendarDays(value: Date | string, days: number) {
  const shifted = value instanceof Date ? new Date(value) : new Date(value)
  if (Number.isNaN(shifted.getTime()) || !Number.isInteger(days)) return null
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted
}

export function isProjectTaskDateRangeValid(
  startDate: Date | string | null | undefined,
  dueDate: Date | string | null | undefined
) {
  if (!startDate || !dueDate) return true
  const startDay = projectTaskCalendarDayKey(startDate)
  const dueDay = projectTaskCalendarDayKey(dueDate)
  return startDay !== null && dueDay !== null && startDay <= dueDay
}

export function wouldCreateTaskParentCycle(
  taskId: string,
  proposedParentId: string | null | undefined,
  tasks: Array<{ id: string; parentTaskId: string | null }>
) {
  if (!proposedParentId) return false

  const parentById = new Map(tasks.map((task) => [task.id, task.parentTaskId]))
  const visited = new Set<string>()
  let currentId: string | null | undefined = proposedParentId

  while (currentId) {
    if (currentId === taskId || visited.has(currentId)) return true
    visited.add(currentId)
    currentId = parentById.get(currentId)
  }

  return false
}

export function getTaskStatusForSectionName(name: string | null | undefined): ProjectTaskStatus | null {
  const normalized = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '')

  if (normalized === 'todo' || normalized === 'backlog') return 'TODO'
  if (normalized === 'inprogress' || normalized === 'doing') return 'IN_PROGRESS'
  if (normalized === 'done' || normalized === 'complete' || normalized === 'completed') return 'DONE'

  return null
}

export const PROJECT_TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const

export type ProjectTaskStatus = (typeof PROJECT_TASK_STATUSES)[number]

export function isProjectTaskStatus(value: unknown): value is ProjectTaskStatus {
  return (
    typeof value === 'string' &&
    (PROJECT_TASK_STATUSES as readonly string[]).includes(value)
  )
}

export function getTaskStatusForSectionName(name: string | null | undefined): ProjectTaskStatus | null {
  const normalized = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '')

  if (normalized === 'todo' || normalized === 'backlog') return 'TODO'
  if (normalized === 'inprogress' || normalized === 'doing') return 'IN_PROGRESS'
  if (normalized === 'done' || normalized === 'complete' || normalized === 'completed') return 'DONE'

  return null
}

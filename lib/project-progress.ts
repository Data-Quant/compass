const DAY_MS = 24 * 60 * 60 * 1000

export const PROJECT_TASK_TIME_ZONE = 'Asia/Karachi'

const PROJECT_TASK_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: PROJECT_TASK_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export type ProgressTask = {
  status: string
  assigneeId?: string | null
  assistants?: Array<{
    userId?: string | null
    user?: { id: string } | null
  }>
  section?: { isBacklog: boolean } | null
}

export type VarianceTask = {
  status: string
  dueDate?: Date | string | null
  section?: { isBacklog: boolean } | null
}

export type ProjectProgress = {
  completed: number
  total: number
  percentage: number | null
}

export type TaskVariance = {
  isOverdue: boolean
  daysLate: number
}

export function isBacklogTask(task: { section?: { isBacklog: boolean } | null }) {
  return task.section?.isBacklog === true
}

export function isTaskAssignedTo(
  task: Pick<ProgressTask, 'assigneeId' | 'assistants'>,
  userId: string,
) {
  return task.assigneeId === userId
    || Boolean(task.assistants?.some((assistant) => (
      assistant.userId === userId || assistant.user?.id === userId
    )))
}

export function calculateProjectProgress(
  tasks: ProgressTask[],
  options: { assigneeId?: string | null } = {}
): ProjectProgress {
  const activeTasks = tasks.filter((task) => {
    if (isBacklogTask(task)) return false
    if (options.assigneeId !== undefined && options.assigneeId !== null) {
      return isTaskAssignedTo(task, options.assigneeId)
    }
    return true
  })
  const completed = activeTasks.filter((task) => task.status === 'DONE').length
  const total = activeTasks.length

  return {
    completed,
    total,
    percentage: total === 0 ? null : Math.round((completed / total) * 100),
  }
}

export function projectTaskCalendarDayKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const parts = PROJECT_TASK_DATE_FORMATTER.formatToParts(date)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const day = Number(parts.find((part) => part.type === 'day')?.value)
  if (!year || !month || !day) return null

  return Date.UTC(year, month - 1, day)
}

export function calculateTaskVariance(task: VarianceTask, now = new Date()): TaskVariance {
  if (task.status === 'DONE' || isBacklogTask(task) || !task.dueDate) {
    return { isOverdue: false, daysLate: 0 }
  }

  const dueDay = projectTaskCalendarDayKey(task.dueDate)
  const today = projectTaskCalendarDayKey(now)
  if (dueDay === null || today === null || dueDay >= today) {
    return { isOverdue: false, daysLate: 0 }
  }

  return {
    isOverdue: true,
    daysLate: Math.floor((today - dueDay) / DAY_MS),
  }
}

export function shouldMarkTaskCompletedLate(input: {
  wasCompletedLate?: boolean
  previousStatus: string
  nextStatus: string
  dueDate?: Date | string | null
  section?: { isBacklog: boolean } | null
  now?: Date
}) {
  if (input.wasCompletedLate) return true
  if (input.previousStatus === 'DONE' || input.nextStatus !== 'DONE') return false

  return calculateTaskVariance(
    {
      status: input.previousStatus,
      dueDate: input.dueDate,
      section: input.section,
    },
    input.now
  ).isOverdue
}

import type { Prisma } from '@prisma/client'
import type { AnalyticsTask } from './project-analytics'

export const ANALYTICS_TASK_SELECT = {
  id: true,
  projectId: true,
  parentTaskId: true,
  status: true,
  priority: true,
  assigneeId: true,
  createdAt: true,
  completedAt: true,
  completedLate: true,
  dueDate: true,
  section: { select: { id: true, name: true, isBacklog: true, isDone: true, orderIndex: true } },
  assistants: { select: { userId: true, createdAt: true } },
  _count: { select: { childTasks: true } },
} satisfies Prisma.TaskSelect

export const NOT_BACKLOG_TASK_WHERE = {
  OR: [{ sectionId: null }, { section: { isBacklog: false } }],
} satisfies Prisma.TaskWhereInput

export const OTHER_PROJECT_ID = 'other'

export function toAnalyticsTask<T extends { _count: { childTasks: number } }>({ _count, ...task }: T) {
  return { ...task, childCount: _count.childTasks }
}

// Tasks from projects the viewer cannot open keep their counts but lose title and project.
export function maskInaccessibleTasks(tasks: AnalyticsTask[], accessibleProjectIds: Set<string>): AnalyticsTask[] {
  return tasks.map((task) => (
    accessibleProjectIds.has(task.projectId)
      ? task
      : { ...task, title: undefined, projectId: OTHER_PROJECT_ID }
  ))
}

export function projectParticipants(project: {
  owner: { id: string; name: string }
  members: Array<{ user: { id: string; name: string } }>
}) {
  const people = new Map([[project.owner.id, project.owner.name]])
  for (const { user } of project.members) people.set(user.id, user.name)
  return [...people].map(([id, name]) => ({ id, name }))
}

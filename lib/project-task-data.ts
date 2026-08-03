import type { Prisma } from '@prisma/client'

export const PROJECT_TASK_INCLUDE = {
  assignee: { select: { id: true, name: true } },
  section: {
    select: {
      id: true,
      name: true,
      color: true,
      canonicalStatus: true,
      isDefault: true,
      isDone: true,
      isBacklog: true,
      orderIndex: true,
    },
  },
  parentTask: {
    select: {
      id: true,
      title: true,
      assigneeId: true,
      assignee: { select: { id: true, name: true } },
      assistants: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  },
  childTasks: {
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      assigneeId: true,
      dueDate: true,
      completedLate: true,
      sectionId: true,
      parentTaskId: true,
      assignee: { select: { id: true, name: true } },
      assistants: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      },
      section: {
        select: {
          id: true,
          name: true,
          color: true,
          canonicalStatus: true,
          isDone: true,
          isBacklog: true,
        },
      },
      _count: { select: { comments: true } },
    },
    orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
  },
  assistants: {
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  },
  labelAssignments: { include: { label: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.TaskInclude

type BacklogVisibilityTask = {
  id: string
  section?: { isBacklog?: boolean | null } | null
  parentTaskId?: string | null
  parentTask?: { id: string } | null
  childTasks?: Array<{ id: string }>
}

/**
 * Removes backlog rows and any embedded parent/child summaries that point at
 * those rows. Workspace task payloads include both relations, so filtering only
 * the top-level array would still disclose hidden backlog task metadata.
 */
export function filterTasksForBacklogAccess<T extends BacklogVisibilityTask>(
  tasks: T[],
  canUseBacklog: boolean,
  visibilityScope: Array<Pick<BacklogVisibilityTask, 'id' | 'section'>> = tasks,
): T[] {
  if (canUseBacklog) return tasks

  const visibleTaskIds = new Set(
    visibilityScope.filter((task) => !task.section?.isBacklog).map((task) => task.id),
  )

  return tasks
    .filter((task) => visibleTaskIds.has(task.id))
    .map((task) => {
      const hasVisibleParent = !task.parentTaskId || visibleTaskIds.has(task.parentTaskId)
      return {
        ...task,
        ...(task.parentTaskId !== undefined && {
          parentTaskId: hasVisibleParent ? task.parentTaskId : null,
        }),
        ...(task.parentTask !== undefined && {
          parentTask: hasVisibleParent
            && task.parentTask
            && visibleTaskIds.has(task.parentTask.id)
            ? task.parentTask
            : null,
        }),
        ...(task.childTasks !== undefined && {
          childTasks: task.childTasks.filter((child) => visibleTaskIds.has(child.id)),
        }),
      } as T
    })
}

export function taskSubtreeContainsBacklog(
  taskId: string,
  tasks: Array<{
    id: string
    parentTaskId?: string | null
    section?: { isBacklog?: boolean | null } | null
  }>,
) {
  const childrenByParent = new Map<string, string[]>()
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  for (const task of tasks) {
    if (!task.parentTaskId) continue
    const children = childrenByParent.get(task.parentTaskId) || []
    children.push(task.id)
    childrenByParent.set(task.parentTaskId, children)
  }

  const pending = [taskId]
  const visited = new Set<string>()
  while (pending.length > 0) {
    const currentId = pending.pop()!
    if (visited.has(currentId)) continue
    visited.add(currentId)
    if (taskById.get(currentId)?.section?.isBacklog) return true
    pending.push(...(childrenByParent.get(currentId) || []))
  }
  return false
}

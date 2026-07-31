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

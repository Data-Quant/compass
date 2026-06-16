import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  sendChildTaskCompletedNotification,
  sendTaskAssignmentNotification,
} from '@/lib/project-task-notifications'
import { recordTaskActivity } from '@/lib/project-task-activity'
import {
  ensureProjectStatusSections,
  getTaskStatusForSection,
  resolveTaskStatusSection,
} from '@/lib/project-status-sections'
import { isProjectTaskStatus } from '@/lib/project-task-utils'
import { syncProjectCompletion } from '@/lib/project-completion'

const TASK_INCLUDE = {
  assignee: { select: { id: true, name: true } },
  section: { select: { id: true, name: true, color: true, canonicalStatus: true, isDefault: true, isDone: true, orderIndex: true } },
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
      sectionId: true,
      parentTaskId: true,
      assignee: { select: { id: true, name: true } },
      section: { select: { id: true, name: true, color: true, canonicalStatus: true, isDone: true } },
      _count: { select: { comments: true } },
    },
    orderBy: [{ orderIndex: 'asc' as const }, { createdAt: 'asc' as const }],
  },
  assistants: {
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  labelAssignments: { include: { label: true } },
  _count: { select: { comments: true } },
}

function uniqueStringArray(value: unknown) {
  if (!Array.isArray(value)) return null
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()))]
}

function formatDateForActivity(value: Date | string | null | undefined) {
  if (!value) return 'no deadline'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'no deadline'
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function dateKey(value: Date | string | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function displayName(user: { name?: string | null } | null | undefined) {
  return user?.name || 'Someone'
}

function buildTaskUpdateActivities(input: {
  actorName: string
  before: {
    title: string
    description: string | null
    status: string
    priority: string
    assigneeId: string | null
    startDate: Date | null
    dueDate: Date | null
    sectionId: string | null
    section: { name: string } | null
    assignee: { name: string } | null
  }
  after: {
    title: string
    description: string | null
    status: string
    priority: string
    assigneeId: string | null
    startDate: Date | string | null
    dueDate: Date | string | null
    sectionId: string | null
    section: { name: string } | null
    assignee: { name: string } | null
  }
}) {
  const { actorName, before, after } = input
  const activities: Array<{ kind: string; summary: string }> = []

  if (before.title !== after.title) {
    activities.push({ kind: 'title', summary: `${actorName} renamed the task to "${after.title}"` })
  }

  if ((before.description || '') !== (after.description || '')) {
    activities.push({ kind: 'description', summary: `${actorName} updated the description` })
  }

  if (before.sectionId !== after.sectionId || before.status !== after.status) {
    activities.push({ kind: 'status', summary: `${actorName} moved the task to ${after.section?.name || after.status}` })
  }

  if (before.assigneeId !== after.assigneeId) {
    activities.push({
      kind: 'assignee',
      summary: after.assignee
        ? `${actorName} assigned the task to ${after.assignee.name}`
        : `${actorName} unassigned the task`,
    })
  }

  if (before.priority !== after.priority) {
    activities.push({ kind: 'priority', summary: `${actorName} changed the priority to ${after.priority}` })
  }

  if (dateKey(before.startDate) !== dateKey(after.startDate)) {
    activities.push({ kind: 'startDate', summary: `${actorName} changed the start date to ${formatDateForActivity(after.startDate)}` })
  }

  if (dateKey(before.dueDate) !== dateKey(after.dueDate)) {
    activities.push({ kind: 'dueDate', summary: `${actorName} changed the deadline to ${formatDateForActivity(after.dueDate)}` })
  }

  return activities
}

async function validateProjectMemberIds(projectId: string, userIds: string[]) {
  if (userIds.length === 0) return []

  const members = await prisma.projectMember.findMany({
    where: { projectId, userId: { in: userIds } },
    select: { userId: true },
  })
  const memberIds = new Set(members.map((member) => member.userId))
  const invalidIds = userIds.filter((userId) => !memberIds.has(userId))

  if (invalidIds.length > 0) {
    throw new Error('Assistants must be project members')
  }

  return userIds
}

// POST - Create a new task
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: projectId } = await params
    const { title, description, status, assigneeId, priority, startDate, dueDate, sectionId, parentTaskId, labelIds, assistantIds } = await request.json()

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Task title is required' }, { status: 400 })
    }

    const normalizedAssigneeId = typeof assigneeId === 'string' && assigneeId.trim() ? assigneeId.trim() : null

    if (status !== undefined && !isProjectTaskStatus(status)) {
      return NextResponse.json({ error: 'Invalid task status' }, { status: 400 })
    }

    await ensureProjectStatusSections(projectId)
    const section = await resolveTaskStatusSection({
      projectId,
      sectionId: typeof sectionId === 'string' ? sectionId : null,
      status,
      fallbackStatus: 'TODO',
    })

    if (sectionId && !section) {
      return NextResponse.json({ error: 'Invalid section for this project' }, { status: 400 })
    }

    const parentTask = parentTaskId
      ? await prisma.task.findFirst({
          where: { id: parentTaskId, projectId },
          select: { id: true },
        })
      : null

    if (parentTaskId && !parentTask) {
      return NextResponse.json({ error: 'Invalid parent task for this project' }, { status: 400 })
    }

    const cleanAssistantIds = assistantIds === undefined ? undefined : uniqueStringArray(assistantIds)
    if (assistantIds !== undefined && !cleanAssistantIds) {
      return NextResponse.json({ error: 'assistantIds must be an array of user IDs' }, { status: 400 })
    }

    const validAssistantIds = cleanAssistantIds
      ? await validateProjectMemberIds(projectId, cleanAssistantIds)
      : []
    const taskAssistantIds = validAssistantIds.filter((userId) => userId !== normalizedAssigneeId)

    if (!section) {
      return NextResponse.json({ error: 'No task status section is available for this project' }, { status: 400 })
    }

    const taskStatus = getTaskStatusForSection(section)

    // Get next order index (within section if specified)
    const lastTask = await prisma.task.findFirst({
      where: { projectId, sectionId: section.id },
      orderBy: { orderIndex: 'desc' },
    })

    const task = await prisma.task.create({
      data: {
        projectId,
        sectionId: section.id,
        parentTaskId: parentTaskId || null,
        title: title.trim(),
        description: description?.trim() || null,
        status: taskStatus,
        completedAt: taskStatus === 'DONE' ? new Date() : null,
        assigneeId: normalizedAssigneeId,
        priority: priority || 'MEDIUM',
        startDate: startDate ? new Date(startDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        orderIndex: (lastTask?.orderIndex || 0) + 1,
        ...(labelIds?.length > 0 && {
          labelAssignments: {
            create: labelIds.map((labelId: string) => ({ labelId })),
          },
        }),
        ...(taskAssistantIds.length > 0 && {
          assistants: {
            create: taskAssistantIds.map((userId) => ({ userId, assignedById: user.id })),
          },
        }),
      },
      include: TASK_INCLUDE,
    })

    await recordTaskActivity({
      taskId: task.id,
      actorId: user.id,
      summary: `${displayName(user)} created this task`,
      kind: 'created',
      notify: false,
      origin: request.nextUrl.origin,
    })

    if (normalizedAssigneeId) {
      try {
        await sendTaskAssignmentNotification({
          taskId: task.id,
          userIds: [normalizedAssigneeId],
          actorId: user.id,
          origin: request.nextUrl.origin,
          context: 'assignee',
        })
      } catch (notificationError) {
        console.error('Failed to send task assignment notification:', notificationError)
      }
    }

    if (taskAssistantIds.length > 0) {
      try {
        await sendTaskAssignmentNotification({
          taskId: task.id,
          userIds: taskAssistantIds,
          actorId: user.id,
          origin: request.nextUrl.origin,
          context: 'assistant',
        })
      } catch (notificationError) {
        console.error('Failed to send task assistant notification:', notificationError)
      }
    }

    if (taskStatus === 'DONE' && task.parentTaskId) {
      try {
        await sendChildTaskCompletedNotification(task.id, request.nextUrl.origin)
      } catch (notificationError) {
        console.error('Failed to send child task completion notification:', notificationError)
      }
    }

    try {
      await syncProjectCompletion(projectId)
    } catch (syncError) {
      console.error('Failed to sync project completion status:', syncError)
    }

    return NextResponse.json({ success: true, task })
  } catch (error) {
    console.error('Failed to create task:', error)
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}

// PUT - Update a task (pass taskId in body)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: projectId } = await params
    const { taskId, title, description, status, priority, assigneeId, startDate, dueDate, sectionId, parentTaskId, labelIds, assistantIds, orderIndex } = await request.json()

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
    }

    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        projectId: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        assigneeId: true,
        startDate: true,
        dueDate: true,
        sectionId: true,
        parentTaskId: true,
        section: { select: { name: true } },
        assignee: { select: { name: true } },
        assistants: { select: { userId: true } },
      },
    })

    if (!existingTask || existingTask.projectId !== projectId) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (status !== undefined && !isProjectTaskStatus(status)) {
      return NextResponse.json({ error: 'Invalid task status' }, { status: 400 })
    }

    await ensureProjectStatusSections(projectId)
    const section = sectionId !== undefined || status !== undefined
      ? await resolveTaskStatusSection({
          projectId,
          sectionId: typeof sectionId === 'string' ? sectionId : null,
          status,
          fallbackStatus: status || 'TODO',
        })
      : null

    if ((sectionId !== undefined || status !== undefined) && !section) {
      return NextResponse.json({ error: 'Invalid status section for this project' }, { status: 400 })
    }

    if (parentTaskId !== undefined) {
      if (parentTaskId === taskId) {
        return NextResponse.json({ error: 'A task cannot be its own parent' }, { status: 400 })
      }

      if (parentTaskId) {
        const parentTask = await prisma.task.findFirst({
          where: { id: parentTaskId, projectId },
          select: { id: true },
        })
        if (!parentTask) {
          return NextResponse.json({ error: 'Invalid parent task for this project' }, { status: 400 })
        }
      }
    }

    const normalizedAssigneeId = assigneeId === undefined
      ? undefined
      : (typeof assigneeId === 'string' && assigneeId.trim() ? assigneeId.trim() : null)
    const cleanAssistantIds = assistantIds === undefined ? undefined : uniqueStringArray(assistantIds)
    if (assistantIds !== undefined && !cleanAssistantIds) {
      return NextResponse.json({ error: 'assistantIds must be an array of user IDs' }, { status: 400 })
    }
    const nextAssigneeId = normalizedAssigneeId === undefined ? existingTask.assigneeId : normalizedAssigneeId
    const existingAssistantIds = existingTask.assistants.map((assistant) => assistant.userId)
    const validAssistantIds = cleanAssistantIds
      ? (await validateProjectMemberIds(projectId, cleanAssistantIds)).filter((userId) => userId !== nextAssigneeId)
      : undefined

    const updateData: any = {}
    if (title !== undefined) updateData.title = title.trim()
    if (description !== undefined) updateData.description = description?.trim() || null
    if (section) {
      const nextStatus = getTaskStatusForSection(section)
      updateData.sectionId = section.id
      updateData.status = nextStatus
      updateData.completedAt = nextStatus === 'DONE' ? new Date() : null
    }
    if (priority !== undefined) updateData.priority = priority
    if (normalizedAssigneeId !== undefined) updateData.assigneeId = normalizedAssigneeId
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null
    if (parentTaskId !== undefined) updateData.parentTaskId = parentTaskId || null
    if (orderIndex !== undefined) updateData.orderIndex = orderIndex

    // Handle labels update: replace all label assignments
    if (labelIds !== undefined) {
      await prisma.taskLabelAssignment.deleteMany({ where: { taskId } })
      if (labelIds.length > 0) {
        await prisma.taskLabelAssignment.createMany({
          data: labelIds.map((labelId: string) => ({ taskId, labelId })),
        })
      }
    }

    if (validAssistantIds !== undefined) {
      await prisma.taskAssistant.deleteMany({ where: { taskId } })
      if (validAssistantIds.length > 0) {
        await prisma.taskAssistant.createMany({
          data: validAssistantIds.map((userId) => ({ taskId, userId, assignedById: user.id })),
        })
      }
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: TASK_INCLUDE,
    })

    const activities = buildTaskUpdateActivities({
      actorName: displayName(user),
      before: existingTask,
      after: task,
    })

    for (const activity of activities) {
      await recordTaskActivity({
        taskId: task.id,
        actorId: user.id,
        summary: activity.summary,
        kind: activity.kind,
        metadata: { taskId: task.id },
        origin: request.nextUrl.origin,
      })
    }

    if (normalizedAssigneeId !== undefined && normalizedAssigneeId && normalizedAssigneeId !== existingTask.assigneeId) {
      try {
        await sendTaskAssignmentNotification({
          taskId: task.id,
          userIds: [normalizedAssigneeId],
          actorId: user.id,
          origin: request.nextUrl.origin,
          context: 'assignee',
        })
      } catch (notificationError) {
        console.error('Failed to send task assignment notification:', notificationError)
      }
    }

    if (validAssistantIds !== undefined) {
      const newAssistantIds = validAssistantIds.filter((userId) => !existingAssistantIds.includes(userId))
      if (newAssistantIds.length > 0) {
        try {
          await sendTaskAssignmentNotification({
            taskId: task.id,
            userIds: newAssistantIds,
            actorId: user.id,
            origin: request.nextUrl.origin,
            context: 'assistant',
          })
        } catch (notificationError) {
          console.error('Failed to send task assistant notification:', notificationError)
        }
      }
    }

    if (task.status === 'DONE' && existingTask.status !== 'DONE' && task.parentTaskId) {
      try {
        await sendChildTaskCompletedNotification(task.id, request.nextUrl.origin)
      } catch (notificationError) {
        console.error('Failed to send child task completion notification:', notificationError)
      }
    }

    try {
      await syncProjectCompletion(projectId)
    } catch (syncError) {
      console.error('Failed to sync project completion status:', syncError)
    }

    return NextResponse.json({ success: true, task })
  } catch (error) {
    console.error('Failed to update task:', error)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}

// DELETE - Delete a task (taskId in query)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: projectId } = await params
    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get('taskId')

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
    }

    const task = await prisma.task.findFirst({
      where: { id: taskId, projectId },
      select: { id: true },
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    await prisma.task.delete({ where: { id: taskId } })

    try {
      await syncProjectCompletion(projectId)
    } catch (syncError) {
      console.error('Failed to sync project completion status:', syncError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete task:', error)
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}

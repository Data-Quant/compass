import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendChildTaskCompletedNotification } from '@/lib/project-task-notifications'
import { getTaskStatusForSectionName, isProjectTaskStatus } from '@/lib/project-task-utils'

const TASK_INCLUDE = {
  assignee: { select: { id: true, name: true } },
  section: { select: { id: true, name: true } },
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
      parentTaskId: true,
      assignee: { select: { id: true, name: true } },
      _count: { select: { comments: true } },
    },
    orderBy: [{ status: 'asc' as const }, { orderIndex: 'asc' as const }, { createdAt: 'asc' as const }],
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

    const section = sectionId
      ? await prisma.taskSection.findFirst({
          where: { id: sectionId, projectId },
          select: { id: true, name: true },
        })
      : null

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

    const taskStatus = status || getTaskStatusForSectionName(section?.name) || 'TODO'

    // Get next order index (within section if specified)
    const lastTask = await prisma.task.findFirst({
      where: { projectId, sectionId: sectionId || null },
      orderBy: { orderIndex: 'desc' },
    })

    const task = await prisma.task.create({
      data: {
        projectId,
        sectionId: sectionId || null,
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

    if (taskStatus === 'DONE' && task.parentTaskId) {
      try {
        await sendChildTaskCompletedNotification(task.id, request.nextUrl.origin)
      } catch (notificationError) {
        console.error('Failed to send child task completion notification:', notificationError)
      }
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
      select: { id: true, projectId: true, status: true, assigneeId: true },
    })

    if (!existingTask || existingTask.projectId !== projectId) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (status !== undefined && !isProjectTaskStatus(status)) {
      return NextResponse.json({ error: 'Invalid task status' }, { status: 400 })
    }

    if (sectionId) {
      const section = await prisma.taskSection.findFirst({
        where: { id: sectionId, projectId },
        select: { id: true },
      })
      if (!section) {
        return NextResponse.json({ error: 'Invalid section for this project' }, { status: 400 })
      }
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
    const validAssistantIds = cleanAssistantIds
      ? (await validateProjectMemberIds(projectId, cleanAssistantIds)).filter((userId) => userId !== nextAssigneeId)
      : undefined

    const updateData: any = {}
    if (title !== undefined) updateData.title = title.trim()
    if (description !== undefined) updateData.description = description?.trim() || null
    if (status !== undefined) {
      updateData.status = status
      if (status === 'DONE') updateData.completedAt = new Date()
      else updateData.completedAt = null
    }
    if (priority !== undefined) updateData.priority = priority
    if (normalizedAssigneeId !== undefined) updateData.assigneeId = normalizedAssigneeId
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null
    if (sectionId !== undefined) updateData.sectionId = sectionId || null
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

    if (status === 'DONE' && existingTask.status !== 'DONE' && task.parentTaskId) {
      try {
        await sendChildTaskCompletedNotification(task.id, request.nextUrl.origin)
      } catch (notificationError) {
        console.error('Failed to send child task completion notification:', notificationError)
      }
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

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete task:', error)
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}

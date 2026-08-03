import { NextRequest, NextResponse } from 'next/server'
import type { ProjectStatus } from '@prisma/client'
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
import {
  isProjectTaskDateRangeValid,
  isProjectTaskPriority,
  isProjectTaskStatus,
  wouldCreateTaskParentCycle,
} from '@/lib/project-task-utils'
import { syncProjectCompletion } from '@/lib/project-completion'
import {
  canEditAssignedProjectTask,
  getProjectAuthorization,
  projectAuthorizationFailure,
} from '@/lib/project-access'
import {
  filterTasksForBacklogAccess,
  PROJECT_TASK_INCLUDE,
  taskSubtreeContainsBacklog,
} from '@/lib/project-task-data'
import { shouldMarkTaskCompletedLate } from '@/lib/project-progress'

const MAX_TASK_ORDER_INDEX = 1_000_000_000

class ProjectTaskInputError extends Error {}

function uniqueStringArray(value: unknown) {
  if (!Array.isArray(value)) return null
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()))]
}

function parseTaskDate(value: unknown, fieldName: string) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  if (typeof value !== 'string' && !(value instanceof Date)) {
    throw new ProjectTaskInputError(`Invalid ${fieldName}`)
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new ProjectTaskInputError(`Invalid ${fieldName}`)
  return date
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

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      ownerId: true,
      members: { where: { userId: { in: userIds } }, select: { userId: true } },
    },
  })
  const memberIds = new Set(project?.members.map((member) => member.userId) || [])
  if (project?.ownerId) memberIds.add(project.ownerId)
  const invalidIds = userIds.filter((userId) => !memberIds.has(userId))

  if (invalidIds.length > 0) {
    throw new ProjectTaskInputError('Assignees and assistants must be project members')
  }

  return userIds
}

async function validateProjectLabelIds(projectId: string, value: unknown) {
  if (value === undefined) return undefined
  const labelIds = uniqueStringArray(value)
  if (!labelIds) throw new ProjectTaskInputError('labelIds must be an array of label IDs')
  if (labelIds.length === 0) return []

  const labels = await prisma.taskLabel.findMany({
    where: { projectId, id: { in: labelIds } },
    select: { id: true },
  })
  if (labels.length !== labelIds.length) {
    throw new ProjectTaskInputError('Labels must belong to this project')
  }
  return labelIds
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
    const authorization = await getProjectAuthorization(projectId, user)
    const authorizationFailure = projectAuthorizationFailure(authorization)
    if (authorizationFailure) {
      return NextResponse.json({ error: authorizationFailure.error }, { status: authorizationFailure.status })
    }
    const { title, description, status, assigneeId, priority, startDate, dueDate, sectionId, parentTaskId, labelIds, assistantIds } = await request.json()

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Task title is required' }, { status: 400 })
    }

    const requestedAssigneeId = typeof assigneeId === 'string' && assigneeId.trim() ? assigneeId.trim() : null
    // Member-created work belongs to its creator by default. Leads/HR retain
    // the ability to create genuinely unassigned backlog items.
    const normalizedAssigneeId = requestedAssigneeId || (!authorization.canManage ? user.id : null)

    if (normalizedAssigneeId && !authorization.canManage && normalizedAssigneeId !== user.id) {
      return NextResponse.json({ error: 'Only a project lead or HR can assign tasks to someone else' }, { status: 403 })
    }
    if (normalizedAssigneeId) await validateProjectMemberIds(projectId, [normalizedAssigneeId])

    if (status !== undefined && !isProjectTaskStatus(status)) {
      return NextResponse.json({ error: 'Invalid task status' }, { status: 400 })
    }
    if (priority !== undefined && !isProjectTaskPriority(priority)) {
      return NextResponse.json({ error: 'Invalid task priority' }, { status: 400 })
    }

    const parsedStartDate = parseTaskDate(startDate, 'startDate')
    const parsedDueDate = parseTaskDate(dueDate, 'dueDate')
    if (!isProjectTaskDateRangeValid(parsedStartDate, parsedDueDate)) {
      return NextResponse.json({ error: 'startDate cannot be after dueDate' }, { status: 400 })
    }
    const cleanLabelIds = await validateProjectLabelIds(projectId, labelIds)

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
          select: { id: true, section: { select: { isBacklog: true } } },
        })
      : null

    if (parentTaskId && !parentTask) {
      return NextResponse.json({ error: 'Invalid parent task for this project' }, { status: 400 })
    }
    if (parentTask?.section?.isBacklog && !authorization.isParticipant) {
      return NextResponse.json({ error: 'Backlog access is limited to project members' }, { status: 403 })
    }

    const cleanAssistantIds = assistantIds === undefined ? undefined : uniqueStringArray(assistantIds)
    if (assistantIds !== undefined && !cleanAssistantIds) {
      return NextResponse.json({ error: 'assistantIds must be an array of user IDs' }, { status: 400 })
    }
    if (assistantIds !== undefined && !authorization.canManage) {
      return NextResponse.json({ error: 'Only a project lead or HR can assign co-assignees' }, { status: 403 })
    }

    const validAssistantIds = cleanAssistantIds
      ? await validateProjectMemberIds(projectId, cleanAssistantIds)
      : []
    const taskAssistantIds = validAssistantIds.filter((userId) => userId !== normalizedAssigneeId)

    if (!section) {
      return NextResponse.json({ error: 'No task status section is available for this project' }, { status: 400 })
    }
    if (section.isBacklog && !authorization.isParticipant) {
      return NextResponse.json({ error: 'Backlog access is limited to project members' }, { status: 403 })
    }

    const taskStatus = getTaskStatusForSection(section)
    const completedLate = shouldMarkTaskCompletedLate({
      previousStatus: 'TODO',
      nextStatus: taskStatus,
      dueDate: parsedDueDate,
      section,
    })

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
        completedLate,
        assigneeId: normalizedAssigneeId,
        priority: priority || 'MEDIUM',
        startDate: parsedStartDate ?? null,
        dueDate: parsedDueDate ?? null,
        orderIndex: Math.min(Math.max(0, lastTask?.orderIndex || 0) + 1, MAX_TASK_ORDER_INDEX),
        ...(cleanLabelIds && cleanLabelIds.length > 0 && {
          labelAssignments: {
            create: cleanLabelIds.map((labelId) => ({ labelId })),
          },
        }),
        ...(taskAssistantIds.length > 0 && {
          assistants: {
            create: taskAssistantIds.map((userId) => ({ userId, assignedById: user.id })),
          },
        }),
      },
      include: PROJECT_TASK_INCLUDE,
    })

    try {
      await recordTaskActivity({
        taskId: task.id,
        actorId: user.id,
        summary: `${displayName(user)} created this task`,
        kind: 'created',
        notify: false,
        origin: request.nextUrl.origin,
      })
    } catch (activityError) {
      // The task is already committed. Activity history is supplementary and
      // must not turn a successful create into a retryable 500 response.
      console.error('Failed to record task creation activity:', activityError)
    }

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

    let projectStatus: ProjectStatus | null = null
    try {
      projectStatus = await syncProjectCompletion(projectId)
    } catch (syncError) {
      console.error('Failed to sync project completion status:', syncError)
    }

    return NextResponse.json({ success: true, task, projectStatus })
  } catch (error) {
    if (error instanceof ProjectTaskInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
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
    const authorization = await getProjectAuthorization(projectId, user)
    const authorizationFailure = projectAuthorizationFailure(authorization)
    if (authorizationFailure) {
      return NextResponse.json({ error: authorizationFailure.error }, { status: authorizationFailure.status })
    }
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
        completedAt: true,
        completedLate: true,
        sectionId: true,
        parentTaskId: true,
        section: { select: { name: true, isBacklog: true } },
        assignee: { select: { name: true } },
        assistants: { select: { userId: true } },
      },
    })

    if (!existingTask || existingTask.projectId !== projectId) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (!canEditAssignedProjectTask({
      viewerId: user.id,
      assigneeId: existingTask.assigneeId,
      assistantIds: existingTask.assistants.map((assistant) => assistant.userId),
      canManage: authorization.canManage,
    })) {
      return NextResponse.json(
        { error: 'You can only update tasks assigned to you' },
        { status: 403 }
      )
    }

    if (status !== undefined && !isProjectTaskStatus(status)) {
      return NextResponse.json({ error: 'Invalid task status' }, { status: 400 })
    }
    if (priority !== undefined && !isProjectTaskPriority(priority)) {
      return NextResponse.json({ error: 'Invalid task priority' }, { status: 400 })
    }
    if (title !== undefined && !String(title).trim()) {
      return NextResponse.json({ error: 'Task title cannot be empty' }, { status: 400 })
    }
    if (
      orderIndex !== undefined &&
      (!Number.isInteger(orderIndex) || orderIndex < 0 || orderIndex > MAX_TASK_ORDER_INDEX)
    ) {
      return NextResponse.json({ error: 'orderIndex must be a non-negative integer' }, { status: 400 })
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
    if (!authorization.isParticipant && (existingTask.section?.isBacklog || section?.isBacklog)) {
      return NextResponse.json({ error: 'Backlog access is limited to project members' }, { status: 403 })
    }

    if (parentTaskId !== undefined) {
      if (parentTaskId === taskId) {
        return NextResponse.json({ error: 'A task cannot be its own parent' }, { status: 400 })
      }

      if (parentTaskId) {
        const projectTasks = await prisma.task.findMany({
          where: { projectId },
          select: {
            id: true,
            parentTaskId: true,
            section: { select: { isBacklog: true } },
          },
        })
        const parentCandidate = projectTasks.find((candidate) => candidate.id === parentTaskId)
        if (!parentCandidate) {
          return NextResponse.json({ error: 'Invalid parent task for this project' }, { status: 400 })
        }
        if (parentCandidate.section?.isBacklog && !authorization.isParticipant) {
          return NextResponse.json({ error: 'Backlog access is limited to project members' }, { status: 403 })
        }
        if (wouldCreateTaskParentCycle(taskId, parentTaskId, projectTasks)) {
          return NextResponse.json({ error: 'A task cannot be nested beneath itself or one of its descendants' }, { status: 400 })
        }
      }
    }

    const normalizedAssigneeId = assigneeId === undefined
      ? undefined
      : (typeof assigneeId === 'string' && assigneeId.trim() ? assigneeId.trim() : null)
    if (normalizedAssigneeId !== undefined && normalizedAssigneeId !== existingTask.assigneeId && !authorization.canManage) {
      return NextResponse.json({ error: 'Only a project lead or HR can reassign tasks' }, { status: 403 })
    }
    if (assistantIds !== undefined && !authorization.canManage) {
      return NextResponse.json({ error: 'Only a project lead or HR can change co-assignees' }, { status: 403 })
    }
    if (normalizedAssigneeId) await validateProjectMemberIds(projectId, [normalizedAssigneeId])

    const parsedStartDate = parseTaskDate(startDate, 'startDate')
    const parsedDueDate = parseTaskDate(dueDate, 'dueDate')
    const effectiveStartDate = parsedStartDate === undefined ? existingTask.startDate : parsedStartDate
    const effectiveDueDate = parsedDueDate === undefined ? existingTask.dueDate : parsedDueDate
    if (!isProjectTaskDateRangeValid(effectiveStartDate, effectiveDueDate)) {
      return NextResponse.json({ error: 'startDate cannot be after dueDate' }, { status: 400 })
    }

    const cleanLabelIds = await validateProjectLabelIds(projectId, labelIds)
    const cleanAssistantIds = assistantIds === undefined ? undefined : uniqueStringArray(assistantIds)
    if (assistantIds !== undefined && !cleanAssistantIds) {
      return NextResponse.json({ error: 'assistantIds must be an array of user IDs' }, { status: 400 })
    }
    const nextAssigneeId = normalizedAssigneeId === undefined ? existingTask.assigneeId : normalizedAssigneeId
    const existingAssistantIds = existingTask.assistants.map((assistant) => assistant.userId)
    const validAssistantIds = cleanAssistantIds
      ? (await validateProjectMemberIds(projectId, cleanAssistantIds)).filter((userId) => userId !== nextAssigneeId)
      : undefined

    const nextSection = section || existingTask.section
    const nextStatus = section ? getTaskStatusForSection(section) : existingTask.status
    if (existingTask.section?.isBacklog && !nextSection?.isBacklog) {
      if (!nextAssigneeId || !effectiveDueDate) {
        return NextResponse.json(
          { error: 'Backlog tasks require an assignee and due date before promotion' },
          { status: 400 }
        )
      }
    }

    const completedLate = shouldMarkTaskCompletedLate({
      wasCompletedLate: existingTask.completedLate,
      previousStatus: existingTask.status,
      nextStatus,
      dueDate: effectiveDueDate,
      section: nextSection,
    })

    const updateData: any = {}
    if (title !== undefined) updateData.title = title.trim()
    if (description !== undefined) updateData.description = description?.trim() || null
    if (section) {
      updateData.sectionId = section.id
      updateData.status = nextStatus
      updateData.completedAt = nextStatus === 'DONE'
        ? (existingTask.status === 'DONE' ? existingTask.completedAt || new Date() : new Date())
        : null
    }
    if (completedLate !== existingTask.completedLate) updateData.completedLate = completedLate
    if (priority !== undefined) updateData.priority = priority
    if (normalizedAssigneeId !== undefined) updateData.assigneeId = normalizedAssigneeId
    if (parsedStartDate !== undefined) updateData.startDate = parsedStartDate
    if (parsedDueDate !== undefined) updateData.dueDate = parsedDueDate
    if (parentTaskId !== undefined) updateData.parentTaskId = parentTaskId || null
    if (orderIndex !== undefined) updateData.orderIndex = orderIndex

    // Replace relation sets inside the task update so a validation or write
    // failure cannot leave labels/assistants partially changed.
    if (cleanLabelIds !== undefined) {
      updateData.labelAssignments = {
        deleteMany: {},
        ...(cleanLabelIds.length > 0 && {
          create: cleanLabelIds.map((labelId) => ({ labelId })),
        }),
      }
    }

    if (validAssistantIds !== undefined) {
      updateData.assistants = {
        deleteMany: {},
        ...(validAssistantIds.length > 0 && {
          create: validAssistantIds.map((userId) => ({ userId, assignedById: user.id })),
        }),
      }
    } else if (normalizedAssigneeId) {
      // The primary assignee must not also remain attached as an assistant.
      updateData.assistants = {
        deleteMany: { userId: normalizedAssigneeId },
      }
    }

    const responseVisibilityScope = authorization.isParticipant
      ? null
      : await prisma.task.findMany({
          where: { projectId },
          select: { id: true, section: { select: { isBacklog: true } } },
        })

    const task = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: PROJECT_TASK_INCLUDE,
    })

    const activities = buildTaskUpdateActivities({
      actorName: displayName(user),
      before: existingTask,
      after: task,
    })

    for (const activity of activities) {
      try {
        await recordTaskActivity({
          taskId: task.id,
          actorId: user.id,
          summary: activity.summary,
          kind: activity.kind,
          metadata: { taskId: task.id },
          origin: request.nextUrl.origin,
        })
      } catch (activityError) {
        // Preserve the successful task mutation even when its audit entry
        // cannot be written; the client must not roll back committed data.
        console.error('Failed to record task update activity:', activityError)
      }
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

    let projectStatus: ProjectStatus | null = null
    try {
      projectStatus = await syncProjectCompletion(projectId)
    } catch (syncError) {
      console.error('Failed to sync project completion status:', syncError)
    }

    const responseTask = responseVisibilityScope
      ? filterTasksForBacklogAccess([task], false, responseVisibilityScope)[0]
      : task
    return NextResponse.json({ success: true, task: responseTask, projectStatus })
  } catch (error) {
    if (error instanceof ProjectTaskInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
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
    const authorization = await getProjectAuthorization(projectId, user)
    const authorizationFailure = projectAuthorizationFailure(authorization, 'manage')
    if (authorizationFailure) {
      return NextResponse.json(
        {
          error: authorizationFailure.status === 403
            ? 'Only a project lead or HR can delete tasks'
            : authorizationFailure.error,
        },
        { status: authorizationFailure.status }
      )
    }
    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get('taskId')

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
    }

    const projectTasks = await prisma.task.findMany({
      where: { projectId },
      select: {
        id: true,
        parentTaskId: true,
        section: { select: { isBacklog: true } },
      },
    })
    const task = projectTasks.find((candidate) => candidate.id === taskId)

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    if (!authorization.isParticipant && taskSubtreeContainsBacklog(task.id, projectTasks)) {
      return NextResponse.json({ error: 'Backlog access is limited to project members' }, { status: 403 })
    }

    await prisma.task.delete({ where: { id: taskId } })

    let projectStatus: ProjectStatus | null = null
    try {
      projectStatus = await syncProjectCompletion(projectId)
    } catch (syncError) {
      console.error('Failed to sync project completion status:', syncError)
    }

    return NextResponse.json({ success: true, projectStatus })
  } catch (error) {
    console.error('Failed to delete task:', error)
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}

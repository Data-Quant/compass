import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canEditAssignedProjectTask, resolveProjectCapabilities } from '@/lib/project-access'
import { syncProjectCompletion } from '@/lib/project-completion'
import { PROJECT_TASK_INCLUDE } from '@/lib/project-task-data'
import { recordTaskActivity } from '@/lib/project-task-activity'
import { sendTaskAssignmentNotification } from '@/lib/project-task-notifications'
import {
  isProjectTaskDateRangeValid,
  isProjectTaskPriority,
  shiftProjectTaskDateByCalendarDays,
  type ProjectTaskPriority,
} from '@/lib/project-task-utils'

const bulkSchema = z.object({
  action: z.enum(['ASSIGNEE', 'PRIORITY', 'SHIFT_DUE_DATE']),
  taskIds: z.array(z.string().trim().min(1)).min(1).max(200),
  value: z.unknown().optional(),
  assigneeId: z.unknown().optional(),
  priority: z.unknown().optional(),
  days: z.unknown().optional(),
})

function uniqueTaskIds(taskIds: string[]) {
  return [...new Set(taskIds)]
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = bulkSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid bulk task payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const taskIds = uniqueTaskIds(parsed.data.taskIds)
    const tasks = await prisma.task.findMany({
      where: { id: { in: taskIds } },
      select: {
        id: true,
        title: true,
        projectId: true,
        assigneeId: true,
        assistants: { select: { userId: true } },
        priority: true,
        startDate: true,
        dueDate: true,
        project: {
          select: {
            ownerId: true,
            members: { select: { userId: true, role: true } },
          },
        },
      },
    })

    if (tasks.length !== taskIds.length) {
      const foundIds = new Set(tasks.map((task) => task.id))
      return NextResponse.json(
        { error: 'One or more tasks were not found', missingTaskIds: taskIds.filter((id) => !foundIds.has(id)) },
        { status: 404 }
      )
    }

    const capabilitiesByProject = new Map<string, ReturnType<typeof resolveProjectCapabilities>>()
    for (const task of tasks) {
      if (!capabilitiesByProject.has(task.projectId)) {
        capabilitiesByProject.set(task.projectId, resolveProjectCapabilities({
          viewer: user,
          ownerId: task.project.ownerId,
          members: task.project.members,
        }))
      }
    }

    if (tasks.some((task) => !capabilitiesByProject.get(task.projectId)?.canAccess)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (
      parsed.data.action !== 'ASSIGNEE' &&
      tasks.some((task) => !canEditAssignedProjectTask({
        viewerId: user.id,
        assigneeId: task.assigneeId,
        assistantIds: task.assistants.map((assistant) => assistant.userId),
        canManage: Boolean(capabilitiesByProject.get(task.projectId)?.canManage),
      }))
    ) {
      return NextResponse.json(
        { error: 'You can only bulk update tasks assigned to you' },
        { status: 403 }
      )
    }

    let assigneeId: string | null | undefined
    let priority: ProjectTaskPriority | undefined
    let shiftDays: number | undefined

    if (parsed.data.action === 'ASSIGNEE') {
      if (tasks.some((task) => !capabilitiesByProject.get(task.projectId)?.canManage)) {
        return NextResponse.json(
          { error: 'Only a project lead or HR can bulk reassign tasks' },
          { status: 403 }
        )
      }

      const rawAssignee = parsed.data.assigneeId !== undefined ? parsed.data.assigneeId : parsed.data.value
      if (rawAssignee === null || rawAssignee === '') {
        assigneeId = null
      } else if (typeof rawAssignee === 'string' && rawAssignee.trim()) {
        assigneeId = rawAssignee.trim()
      } else {
        return NextResponse.json({ error: 'assigneeId must be a user ID or null' }, { status: 400 })
      }

      if (assigneeId) {
        const assignee = await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true } })
        if (!assignee) return NextResponse.json({ error: 'Assignee not found' }, { status: 400 })

        const invalidProject = tasks.find((task) => (
          task.project.ownerId !== assigneeId &&
          !task.project.members.some((membership) => membership.userId === assigneeId)
        ))
        if (invalidProject) {
          return NextResponse.json(
            { error: 'Assignee must be a member of every selected task project' },
            { status: 400 }
          )
        }
      }
    }

    if (parsed.data.action === 'PRIORITY') {
      const rawPriority = parsed.data.priority !== undefined ? parsed.data.priority : parsed.data.value
      if (!isProjectTaskPriority(rawPriority)) {
        return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })
      }
      priority = rawPriority
    }

    if (parsed.data.action === 'SHIFT_DUE_DATE') {
      const rawDays = parsed.data.days !== undefined ? parsed.data.days : parsed.data.value
      shiftDays = typeof rawDays === 'number' ? rawDays : Number(rawDays)
      if (!Number.isInteger(shiftDays) || shiftDays < -3650 || shiftDays > 3650) {
        return NextResponse.json({ error: 'days must be an integer between -3650 and 3650' }, { status: 400 })
      }
    }

    const shiftedDueDates = new Map<string, Date>()
    if (parsed.data.action === 'SHIFT_DUE_DATE') {
      const invalidTaskIds: string[] = []
      for (const task of tasks) {
        if (!task.dueDate) continue
        const shiftedDueDate = shiftProjectTaskDateByCalendarDays(task.dueDate, shiftDays!)
        if (!shiftedDueDate || !isProjectTaskDateRangeValid(task.startDate, shiftedDueDate)) {
          invalidTaskIds.push(task.id)
          continue
        }
        shiftedDueDates.set(task.id, shiftedDueDate)
      }

      if (invalidTaskIds.length > 0) {
        return NextResponse.json(
          {
            error: 'A shifted due date cannot be before its task start date',
            invalidTaskIds,
          },
          { status: 400 }
        )
      }
    }

    const skippedTaskIds: string[] = []
    const updateOperations = tasks.flatMap((task) => {
      if (parsed.data.action === 'SHIFT_DUE_DATE' && !task.dueDate) {
        skippedTaskIds.push(task.id)
        return []
      }

      const data = parsed.data.action === 'ASSIGNEE'
        ? {
            assigneeId: assigneeId ?? null,
            ...(assigneeId && {
              assistants: { deleteMany: { userId: assigneeId } },
            }),
          }
        : parsed.data.action === 'PRIORITY'
          ? { priority: priority! }
          : { dueDate: shiftedDueDates.get(task.id)! }

      return [prisma.task.update({
        where: { id: task.id },
        data,
        include: PROJECT_TASK_INCLUDE,
      })]
    })

    const updatedTasks = updateOperations.length > 0
      ? await prisma.$transaction(updateOperations)
      : []

    await Promise.all([...new Set(tasks.map((task) => task.projectId))].map(async (projectId) => {
      try {
        await syncProjectCompletion(projectId)
      } catch (error) {
        console.error('Failed to sync project completion after bulk task update:', error)
      }
    }))

    await Promise.all(updatedTasks.map(async (task) => {
      try {
        const before = tasks.find((candidate) => candidate.id === task.id)!
        const summary = parsed.data.action === 'ASSIGNEE'
          ? `${user.name || 'Someone'} ${task.assignee ? `assigned the task to ${task.assignee.name}` : 'unassigned the task'}`
          : parsed.data.action === 'PRIORITY'
            ? `${user.name || 'Someone'} changed the priority to ${task.priority}`
            : `${user.name || 'Someone'} shifted the deadline by ${shiftDays} day${Math.abs(shiftDays || 0) === 1 ? '' : 's'}`
        await recordTaskActivity({
          taskId: task.id,
          actorId: user.id,
          summary,
          kind: parsed.data.action === 'ASSIGNEE' ? 'assignee' : parsed.data.action === 'PRIORITY' ? 'priority' : 'dueDate',
          metadata: { bulk: true, action: parsed.data.action },
          origin: request.nextUrl.origin,
        })

        if (parsed.data.action === 'ASSIGNEE' && assigneeId && before.assigneeId !== assigneeId) {
          await sendTaskAssignmentNotification({
            taskId: task.id,
            userIds: [assigneeId],
            actorId: user.id,
            origin: request.nextUrl.origin,
            context: 'assignee',
          })
        }
      } catch (error) {
        console.error('Failed to record bulk task activity:', error)
      }
    }))

    return NextResponse.json({
      success: true,
      action: parsed.data.action,
      updatedCount: updatedTasks.length,
      skippedCount: skippedTaskIds.length,
      skippedTaskIds,
      tasks: updatedTasks,
    })
  } catch (error) {
    console.error('Failed to bulk update project tasks:', error)
    return NextResponse.json({ error: 'Failed to bulk update project tasks' }, { status: 500 })
  }
}

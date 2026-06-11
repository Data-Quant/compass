import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendChildTaskCompletedNotification } from '@/lib/project-task-notifications'
import { recordTaskActivity } from '@/lib/project-task-activity'
import {
  ensureProjectStatusSections,
  getTaskStatusForSection,
  resolveTaskStatusSection,
} from '@/lib/project-status-sections'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionUser = await getSession()
    if (!sessionUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await request.json()

    const task = await prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        assigneeId: true,
        status: true,
        parentTaskId: true,
        startDate: true,
        dueDate: true,
        sectionId: true,
        section: { select: { name: true } },
      },
    })

    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    if (task.assigneeId !== sessionUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const startDate = body.startDate !== undefined ? (body.startDate ? new Date(body.startDate) : null) : undefined
    const dueDate = body.dueDate !== undefined ? (body.dueDate ? new Date(body.dueDate) : null) : undefined

    const validStatuses = ['TODO', 'IN_PROGRESS', 'DONE']
    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']

    if (body.status !== undefined && !validStatuses.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    if (body.priority !== undefined && !validPriorities.includes(body.priority)) {
      return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })
    }

    if (startDate && Number.isNaN(startDate.getTime())) {
      return NextResponse.json({ error: 'Invalid startDate' }, { status: 400 })
    }
    if (dueDate && Number.isNaN(dueDate.getTime())) {
      return NextResponse.json({ error: 'Invalid dueDate' }, { status: 400 })
    }

    const effectiveStart = startDate === undefined ? task.startDate : startDate
    const effectiveDue = dueDate === undefined ? task.dueDate : dueDate
    if (effectiveStart && effectiveDue && effectiveStart.getTime() > effectiveDue.getTime()) {
      return NextResponse.json({ error: 'startDate cannot be after dueDate' }, { status: 400 })
    }

    const updateData: Record<string, any> = {}
    let nextSection: Awaited<ReturnType<typeof resolveTaskStatusSection>> | null = null
    if (body.status !== undefined) {
      await ensureProjectStatusSections(task.projectId)
      nextSection = await resolveTaskStatusSection({
        projectId: task.projectId,
        status: body.status,
        fallbackStatus: body.status,
      })
      if (!nextSection) return NextResponse.json({ error: 'Invalid status section' }, { status: 400 })
      const nextStatus = getTaskStatusForSection(nextSection)
      updateData.status = nextStatus
      updateData.sectionId = nextSection.id
      updateData.completedAt = nextStatus === 'DONE' ? new Date() : null
    }
    if (body.priority !== undefined) updateData.priority = body.priority
    if (body.startDate !== undefined) updateData.startDate = effectiveStart
    if (body.dueDate !== undefined) updateData.dueDate = effectiveDue

    const updatedTask = await prisma.task.update({
      where: { id },
      data: updateData,
      include: {
        project: { select: { id: true, name: true, color: true } },
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
        assistants: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
        labelAssignments: { include: { label: true } },
        _count: { select: { comments: true } },
      },
    })

    const actorName = sessionUser.name || 'Someone'
    if (body.status !== undefined && (updatedTask.sectionId !== task.sectionId || updatedTask.status !== task.status)) {
      await recordTaskActivity({
        taskId: task.id,
        actorId: sessionUser.id,
        summary: `${actorName} moved the task to ${updatedTask.section?.name || updatedTask.status}`,
        kind: 'status',
        origin: request.nextUrl.origin,
      })
    }
    if (body.dueDate !== undefined && (task.dueDate?.toISOString().slice(0, 10) || null) !== (updatedTask.dueDate?.toISOString().slice(0, 10) || null)) {
      const dueLabel = updatedTask.dueDate
        ? updatedTask.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'no deadline'
      await recordTaskActivity({
        taskId: task.id,
        actorId: sessionUser.id,
        summary: `${actorName} changed the deadline to ${dueLabel}`,
        kind: 'dueDate',
        origin: request.nextUrl.origin,
      })
    }

    if (updatedTask.status === 'DONE' && task.status !== 'DONE' && task.parentTaskId) {
      try {
        await sendChildTaskCompletedNotification(task.id, request.nextUrl.origin)
      } catch (notificationError) {
        console.error('Failed to send child task completion notification:', notificationError)
      }
    }

    return NextResponse.json({ success: true, task: updatedTask })
  } catch (error) {
    console.error('Failed to update my task:', error)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}

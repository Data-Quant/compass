import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getTaskStatusForSectionName, isProjectTaskStatus } from '@/lib/project-task-utils'

const TASK_INCLUDE = {
  assignee: { select: { id: true, name: true } },
  section: { select: { id: true, name: true } },
  labelAssignments: { include: { label: true } },
  _count: { select: { comments: true } },
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
    const { title, description, status, assigneeId, priority, startDate, dueDate, sectionId, labelIds } = await request.json()

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Task title is required' }, { status: 400 })
    }

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
        title: title.trim(),
        description: description?.trim() || null,
        status: taskStatus,
        completedAt: taskStatus === 'DONE' ? new Date() : null,
        assigneeId: assigneeId || null,
        priority: priority || 'MEDIUM',
        startDate: startDate ? new Date(startDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        orderIndex: (lastTask?.orderIndex || 0) + 1,
        ...(labelIds?.length > 0 && {
          labelAssignments: {
            create: labelIds.map((labelId: string) => ({ labelId })),
          },
        }),
      },
      include: TASK_INCLUDE,
    })

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
    const { taskId, title, description, status, priority, assigneeId, startDate, dueDate, sectionId, labelIds, orderIndex } = await request.json()

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
    }

    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true },
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

    const updateData: any = {}
    if (title !== undefined) updateData.title = title.trim()
    if (description !== undefined) updateData.description = description?.trim() || null
    if (status !== undefined) {
      updateData.status = status
      if (status === 'DONE') updateData.completedAt = new Date()
      else updateData.completedAt = null
    }
    if (priority !== undefined) updateData.priority = priority
    if (assigneeId !== undefined) updateData.assigneeId = assigneeId || null
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null
    if (sectionId !== undefined) updateData.sectionId = sectionId || null
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

    const task = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: TASK_INCLUDE,
    })

    return NextResponse.json({ success: true, task })
  } catch (error) {
    console.error('Failed to update task:', error)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}

// DELETE - Delete a task (taskId in query)
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get('taskId')

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
    }

    await prisma.task.delete({ where: { id: taskId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete task:', error)
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST - Create a new task
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: projectId } = await params
    const { title, description, assigneeId, priority, dueDate } = await request.json()

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Task title is required' }, { status: 400 })
    }

    // Get next order index
    const lastTask = await prisma.task.findFirst({
      where: { projectId },
      orderBy: { orderIndex: 'desc' },
    })

    const task = await prisma.task.create({
      data: {
        projectId,
        title: title.trim(),
        description: description?.trim() || null,
        assigneeId: assigneeId || null,
        priority: priority || 'MEDIUM',
        dueDate: dueDate ? new Date(dueDate) : null,
        orderIndex: (lastTask?.orderIndex || 0) + 1,
      },
      include: { assignee: { select: { id: true, name: true } } },
    })

    return NextResponse.json({ success: true, task })
  } catch (error) {
    console.error('Failed to create task:', error)
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}

// PUT - Update a task (pass taskId in body)
export async function PUT(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { taskId, title, description, status, priority, assigneeId, dueDate } = await request.json()

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
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
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null

    const task = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: { assignee: { select: { id: true, name: true } } },
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

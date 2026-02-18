import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

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
      select: { id: true, assigneeId: true, startDate: true, dueDate: true },
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
    if (body.status !== undefined) updateData.status = body.status
    if (body.priority !== undefined) updateData.priority = body.priority
    if (body.startDate !== undefined) updateData.startDate = effectiveStart
    if (body.dueDate !== undefined) updateData.dueDate = effectiveDue
    if (body.status === 'DONE') updateData.completedAt = new Date()
    if (body.status && body.status !== 'DONE') updateData.completedAt = null

    const updatedTask = await prisma.task.update({
      where: { id },
      data: updateData,
      include: {
        project: { select: { id: true, name: true, color: true } },
        assignee: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        labelAssignments: { include: { label: true } },
        _count: { select: { comments: true } },
      },
    })

    return NextResponse.json({ success: true, task: updatedTask })
  } catch (error) {
    console.error('Failed to update my task:', error)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}

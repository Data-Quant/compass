import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function diffInDays(start: Date, end: Date): number {
  const dayMs = 24 * 60 * 60 * 1000
  return Math.max(0, Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / dayMs))
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const start = searchParams.get('start')
    const end = searchParams.get('end')
    const view = searchParams.get('view') || 'month'
    const projectId = searchParams.get('projectId') || undefined

    if (!start || !end) {
      return NextResponse.json({ error: 'start and end are required' }, { status: 400 })
    }

    const startDate = new Date(start)
    const endDate = new Date(end)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return NextResponse.json({ error: 'Invalid start or end date' }, { status: 400 })
    }

    const tasks = await prisma.task.findMany({
      where: {
        assigneeId: user.id,
        ...(projectId ? { projectId } : {}),
        OR: [
          {
            dueDate: {
              gte: startDate,
              lte: endDate,
            },
          },
          {
            startDate: {
              gte: startDate,
              lte: endDate,
            },
          },
          {
            AND: [
              { startDate: { lte: endDate } },
              { dueDate: { gte: startDate } },
            ],
          },
        ],
      },
      include: {
        project: { select: { id: true, name: true, color: true } },
        _count: { select: { comments: true } },
      },
      orderBy: [{ startDate: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    })

    const events = tasks.map((task) => {
      const taskStart = task.startDate || task.dueDate || task.createdAt
      const taskEnd = task.dueDate || task.startDate || taskStart
      return {
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        project: task.project,
        startDate: task.startDate,
        dueDate: task.dueDate,
        renderStartDate: taskStart,
        renderEndDate: taskEnd,
        durationDays: diffInDays(taskStart, taskEnd),
        commentsCount: task._count.comments,
      }
    })

    return NextResponse.json({
      view,
      start: startDate,
      end: endDate,
      events,
    })
  } catch (error) {
    console.error('Failed to load my tasks calendar:', error)
    return NextResponse.json({ error: 'Failed to load calendar' }, { status: 500 })
  }
}

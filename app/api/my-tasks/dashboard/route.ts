import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { buildDashboardMetrics } from '@/lib/my-tasks/analytics'
import { SMART_BUCKET_LABELS } from '@/lib/my-tasks/buckets'
import type { MyTaskRecord } from '@/lib/my-tasks/types'

function parseWindow(window: string | null): number {
  if (window === '90d') return 90
  if (window === '30d') return 30
  return 14
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const days = parseWindow(searchParams.get('window'))
    const projectId = searchParams.get('projectId') || undefined

    const tasks = await prisma.task.findMany({
      where: {
        assigneeId: user.id,
        ...(projectId ? { projectId } : {}),
      },
      include: {
        project: { select: { id: true, name: true, color: true } },
        labelAssignments: { include: { label: true } },
        _count: { select: { comments: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    })

    const now = new Date()
    const windowStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

    const mappedTasks: MyTaskRecord[] = tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId,
      dueDate: task.dueDate ? task.dueDate.toISOString() : null,
      startDate: task.startDate ? task.startDate.toISOString() : null,
      createdAt: task.createdAt.toISOString(),
      project: task.project,
      labelAssignments: task.labelAssignments,
      _count: task._count,
    }))

    const metrics = buildDashboardMetrics(mappedTasks, now)
    const totalCompletedInWindow = tasks.filter((task) => {
      if (task.status !== 'DONE') return false
      if (task.completedAt) return task.completedAt >= windowStart
      if (task.dueDate) return task.dueDate >= windowStart
      return task.updatedAt >= windowStart
    }).length

    return NextResponse.json({
      window: `${days}d`,
      ...metrics,
      totalCompletedTasks: totalCompletedInWindow,
      tasksBySmartSection: metrics.tasksBySmartSection.map((row) => ({
        ...row,
        label: SMART_BUCKET_LABELS[row.bucket],
      })),
    })
  } catch (error) {
    console.error('Failed to load my tasks dashboard:', error)
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 })
  }
}

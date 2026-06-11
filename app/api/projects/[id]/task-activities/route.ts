import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: projectId } = await params
    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get('taskId')
    if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 })

    const task = await prisma.task.findFirst({
      where: { id: taskId, projectId },
      select: { id: true },
    })
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const activities = await prisma.taskActivity.findMany({
      where: { taskId },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ activities })
  } catch (error) {
    console.error('Failed to fetch task activities:', error)
    return NextResponse.json({ error: 'Failed to fetch task activities' }, { status: 500 })
  }
}

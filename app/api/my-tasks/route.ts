import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tasks = await prisma.task.findMany({
      where: { assigneeId: user.id },
      include: {
        project: { select: { id: true, name: true, color: true } },
        assignee: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        labelAssignments: { include: { label: true } },
        _count: { select: { comments: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { priority: 'asc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json({ tasks })
  } catch (error) {
    console.error('Failed to fetch my tasks:', error)
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 })
  }
}

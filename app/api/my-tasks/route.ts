import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

type SortKey = 'due_asc' | 'due_desc' | 'recent' | 'priority'
type StatusFilter = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'ACTIVE' | 'ALL'

function parseSort(value: string | null): SortKey {
  if (value === 'due_desc') return 'due_desc'
  if (value === 'recent') return 'recent'
  if (value === 'priority') return 'priority'
  return 'due_asc'
}

function parseStatus(value: string | null): StatusFilter {
  if (value === 'TODO' || value === 'IN_PROGRESS' || value === 'DONE' || value === 'ACTIVE' || value === 'ALL') {
    return value
  }
  return 'ACTIVE'
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const status = parseStatus(searchParams.get('status'))
    const projectId = searchParams.get('projectId')?.trim() || null
    const q = searchParams.get('q')?.trim() || null
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const includeDone = ['1', 'true', 'yes'].includes((searchParams.get('includeDone') || '').toLowerCase())
    const sort = parseSort(searchParams.get('sort'))

    const where: any = {
      assigneeId: user.id,
    }

    if (projectId) where.projectId = projectId
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { project: { name: { contains: q, mode: 'insensitive' } } },
      ]
    }

    if (from || to) {
      where.dueDate = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      }
    }

    if (status === 'TODO' || status === 'IN_PROGRESS' || status === 'DONE') {
      where.status = status
    } else if (status === 'ACTIVE') {
      where.status = { not: 'DONE' }
    }

    if (!includeDone && status !== 'DONE' && status !== 'ALL') {
      where.status = { not: 'DONE' }
    }

    const orderBy =
      sort === 'due_desc'
        ? [{ dueDate: 'desc' as const }, { createdAt: 'desc' as const }]
        : sort === 'recent'
          ? [{ createdAt: 'desc' as const }]
          : sort === 'priority'
            ? [{ priority: 'desc' as const }, { dueDate: 'asc' as const }]
            : [{ dueDate: 'asc' as const }, { priority: 'asc' as const }, { createdAt: 'desc' as const }]

    const tasks = await prisma.task.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, color: true } },
        assignee: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        labelAssignments: { include: { label: true } },
        _count: { select: { comments: true } },
      },
      orderBy,
    })

    return NextResponse.json({ tasks })
  } catch (error) {
    console.error('Failed to fetch my tasks:', error)
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 })
  }
}

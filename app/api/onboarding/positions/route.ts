import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManageOnboarding } from '@/lib/permissions'

function parseOptionalDate(value: unknown): Date | null {
  if (!value || typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function GET() {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const positions = await prisma.position.findMany({
      include: {
        teamLead: {
          select: { id: true, name: true, email: true, department: true },
        },
        newHire: {
          select: { id: true, name: true, status: true, userId: true },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json({ positions })
  } catch (error) {
    console.error('Failed to fetch positions:', error)
    return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const location = typeof body.location === 'string' ? body.location.trim() : ''
    const department = typeof body.department === 'string' ? body.department.trim() : ''
    const teamLeadId = typeof body.teamLeadId === 'string' ? body.teamLeadId : null
    const priority = typeof body.priority === 'string' ? body.priority.toUpperCase() : 'MEDIUM'
    const estimatedCloseDate = parseOptionalDate(body.estimatedCloseDate)

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    if (!['LOW', 'MEDIUM', 'HIGH'].includes(priority)) {
      return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })
    }

    if (teamLeadId) {
      const teamLead = await prisma.user.findUnique({
        where: { id: teamLeadId },
        select: { id: true },
      })
      if (!teamLead) {
        return NextResponse.json({ error: 'Invalid team lead' }, { status: 400 })
      }
    }

    const position = await prisma.position.create({
      data: {
        title,
        location: location || null,
        department: department || null,
        teamLeadId,
        priority: priority as 'LOW' | 'MEDIUM' | 'HIGH',
        estimatedCloseDate,
        status: 'OPEN',
      },
    })

    return NextResponse.json({ success: true, position })
  } catch (error) {
    console.error('Failed to create position:', error)
    return NextResponse.json({ error: 'Failed to create position' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendPositionClosedNotification } from '@/lib/email'
import { canManageOnboarding } from '@/lib/permissions'
import { validateTeamLeadEligibility } from '@/lib/onboarding'

interface RouteContext {
  params: Promise<{ id: string }>
}

function parseOptionalDate(value: unknown): Date | null {
  if (!value || typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const position = await prisma.position.findUnique({
      where: { id },
      include: {
        teamLead: {
          select: { id: true, name: true, email: true, department: true, position: true },
        },
        newHire: {
          include: {
            teamLead: {
              select: { id: true, name: true, email: true },
            },
            buddy: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    })

    if (!position) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 })
    }

    return NextResponse.json({ position })
  } catch (error) {
    console.error('Failed to fetch position:', error)
    return NextResponse.json({ error: 'Failed to fetch position' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const body = await request.json()

    const existing = await prisma.position.findUnique({
      where: { id },
      select: { id: true, status: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 })
    }

    const title = typeof body.title === 'string' ? body.title.trim() : undefined
    const location = typeof body.location === 'string' ? body.location.trim() : undefined
    const department = typeof body.department === 'string' ? body.department.trim() : undefined
    const teamLeadId = typeof body.teamLeadId === 'string' ? body.teamLeadId : body.teamLeadId === null ? null : undefined
    const priority = typeof body.priority === 'string' ? body.priority.toUpperCase() : undefined
    const status = typeof body.status === 'string' ? body.status.toUpperCase() : undefined
    const estimatedCloseDate =
      body.estimatedCloseDate !== undefined ? parseOptionalDate(body.estimatedCloseDate) : undefined

    if (priority && !['LOW', 'MEDIUM', 'HIGH'].includes(priority)) {
      return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })
    }
    if (status && !['OPEN', 'CLOSED', 'CANCELLED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    if (teamLeadId) {
      const teamLeadValidation = await validateTeamLeadEligibility(teamLeadId)
      if (!teamLeadValidation.valid) {
        return NextResponse.json({ error: teamLeadValidation.error }, { status: 400 })
      }
    }

    const shouldClose = status === 'CLOSED' && existing.status !== 'CLOSED'
    const updatedPosition = await prisma.position.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(location !== undefined ? { location: location || null } : {}),
        ...(department !== undefined ? { department: department || null } : {}),
        ...(teamLeadId !== undefined ? { teamLeadId } : {}),
        ...(priority ? { priority: priority as 'LOW' | 'MEDIUM' | 'HIGH' } : {}),
        ...(estimatedCloseDate !== undefined ? { estimatedCloseDate } : {}),
        ...(status ? { status: status as 'OPEN' | 'CLOSED' | 'CANCELLED' } : {}),
        ...(status ? { closedAt: status === 'CLOSED' ? new Date() : null } : {}),
      },
    })

    if (shouldClose) {
      try {
        await sendPositionClosedNotification(id)
      } catch (emailError) {
        console.error('Failed to send position closed notification:', emailError)
      }
    }

    return NextResponse.json({ success: true, position: updatedPosition })
  } catch (error) {
    console.error('Failed to update position:', error)
    return NextResponse.json({ error: 'Failed to update position' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const position = await prisma.position.findUnique({
      where: { id },
      select: { id: true, newHire: { select: { id: true } } },
    })
    if (!position) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 })
    }
    if (position.newHire) {
      return NextResponse.json(
        { error: 'Cannot delete position linked to a new hire' },
        { status: 400 }
      )
    }

    await prisma.position.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete position:', error)
    return NextResponse.json({ error: 'Failed to delete position' }, { status: 500 })
  }
}

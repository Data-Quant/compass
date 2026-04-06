import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const requestId = searchParams.get('requestId')

    if (!requestId) {
      return NextResponse.json({ error: 'requestId is required' }, { status: 400 })
    }

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        employeeId: true,
      },
    })

    if (!leaveRequest) {
      return NextResponse.json({ error: 'Leave request not found' }, { status: 404 })
    }

    const isLead = !isAdminRole(user.role)
      ? await prisma.evaluatorMapping.findFirst({
          where: {
            evaluatorId: user.id,
            evaluateeId: leaveRequest.employeeId,
            relationshipType: 'TEAM_LEAD',
          },
          select: { id: true },
        })
      : null

    const canView =
      isAdminRole(user.role) ||
      leaveRequest.employeeId === user.id ||
      Boolean(isLead)

    if (!canView) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const events = await prisma.leaveAuditEvent.findMany({
      where: { leaveRequestId: requestId },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    })

    return NextResponse.json({ events })
  } catch (error) {
    console.error('Failed to fetch leave audit events:', error)
    return NextResponse.json({ error: 'Failed to fetch leave audit events' }, { status: 500 })
  }
}

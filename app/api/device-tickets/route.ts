import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { sendNewTicketNotificationToHR } from '@/lib/email'

const VALID_STATUSES = ['OPEN', 'UNDER_REVIEW', 'SOLUTION', 'RESOLVED'] as const
const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const

// GET - List device tickets
export async function GET(request: NextRequest) {
  try {
    const user = await getSession()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const onlyOwn = searchParams.get('onlyOwn') === 'true'

    if (status && !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
      return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 })
    }

    if (priority && !VALID_PRIORITIES.includes(priority as (typeof VALID_PRIORITIES)[number])) {
      return NextResponse.json({ error: 'Invalid priority filter' }, { status: 400 })
    }

    const canManageAllTickets = user.role === 'HR' || user.role === 'SECURITY'
    const where: {
      employeeId?: string
      status?: (typeof VALID_STATUSES)[number]
      priority?: (typeof VALID_PRIORITIES)[number]
    } = {}

    // Employees see only their own tickets; HR/Security can see all or only own.
    if (!canManageAllTickets || onlyOwn) {
      where.employeeId = user.id
    }

    if (status) {
      where.status = status as (typeof VALID_STATUSES)[number]
    }

    if (priority) {
      where.priority = priority as (typeof VALID_PRIORITIES)[number]
    }

    if (user.role === 'HR') {
      const tickets = await prisma.deviceTicket.findMany({
        where,
        include: {
          employee: {
            select: { id: true, name: true, department: true, position: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      return NextResponse.json({ tickets })
    }

    if (user.role === 'SECURITY') {
      const tickets = await prisma.deviceTicket.findMany({
        where,
        select: {
          id: true,
          employeeId: true,
          title: true,
          description: true,
          deviceType: true,
          priority: true,
          status: true,
          hrAssignedTo: true,
          solution: true,
          expectedResolutionDate: true,
          resolvedAt: true,
          createdAt: true,
          updatedAt: true,
          employee: {
            select: { id: true, name: true, department: true, position: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      return NextResponse.json({ tickets })
    }

    // Never expose internal HR notes to employees.
    const tickets = await prisma.deviceTicket.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        deviceType: true,
        priority: true,
        status: true,
        solution: true,
        expectedResolutionDate: true,
        hrAssignedTo: true,
        resolvedAt: true,
        createdAt: true,
        updatedAt: true,
        employee: {
          select: { id: true, name: true, department: true, position: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ tickets })
  } catch (error) {
    console.error('Failed to fetch device tickets:', error)
    return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 })
  }
}

// POST - Create a new device ticket
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { title, description, deviceType, priority } = body

    const titleClean = typeof title === 'string' ? title.trim() : ''
    const descriptionClean = typeof description === 'string' ? description.trim() : ''
    const deviceTypeClean = typeof deviceType === 'string' ? deviceType.trim() : ''

    // Validate required fields (after trimming whitespace)
    if (!titleClean || !descriptionClean || !deviceTypeClean) {
      return NextResponse.json({ error: 'Title, description, and device type are required' }, { status: 400 })
    }

    // Validate priority if provided
    if (priority && !VALID_PRIORITIES.includes(priority as (typeof VALID_PRIORITIES)[number])) {
      return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })
    }

    const ticket = await prisma.deviceTicket.create({
      data: {
        employeeId: user.id,
        title: titleClean,
        description: descriptionClean,
        deviceType: deviceTypeClean,
        priority: (priority as (typeof VALID_PRIORITIES)[number]) || 'MEDIUM',
        status: 'OPEN',
      },
      include: {
        employee: {
          select: { id: true, name: true, department: true, position: true },
        },
      },
    })

    // Send notification to support team (HR + Security)
    try {
      await sendNewTicketNotificationToHR(ticket.id)
    } catch (e) {
      console.error('Failed to send new ticket notification to support team:', e)
    }

    return NextResponse.json({ success: true, ticket })
  } catch (error) {
    console.error('Failed to create device ticket:', error)
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 })
  }
}

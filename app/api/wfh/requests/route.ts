import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { z } from 'zod'
import { isAdminRole } from '@/lib/permissions'
import { normalizeLeaveTimeZone } from '@/lib/leave-timezone'
import {
  calculateWfhDays,
  canRequestWfh,
  hasWfhEnded,
  isValidWfhDateRange,
  WFH_STATUSES,
  wfhRequiresLeadApproval,
} from '@/lib/wfh-utils'

const optionalIdSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional().nullable()
)

const optionalTextSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().max(6000).optional().nullable()
)

const optionalTimeZoneSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).max(100).optional().nullable()
)

const wfhRequestSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().trim().min(1).max(4000),
  workPlan: optionalTextSchema,
  requestTimezone: optionalTimeZoneSchema,
})

const wfhRequestCreateSchema = wfhRequestSchema.extend({
  employeeId: optionalIdSchema,
})

const wfhRequestUpdateSchema = wfhRequestSchema.extend({
  id: z.string().trim().min(1),
})

const wfhStatusSchema = z.enum(WFH_STATUSES)

async function userCanSeeEmployeeWfh(userId: string, employeeId: string) {
  const leadMapping = await prisma.evaluatorMapping.findFirst({
    where: {
      evaluatorId: userId,
      evaluateeId: employeeId,
      relationshipType: 'TEAM_LEAD',
    },
    select: { id: true },
  })

  return Boolean(leadMapping)
}

// GET - List WFH requests
export async function GET(request: NextRequest) {
  try {
    const user = await getSession()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    const status = searchParams.get('status')
    const forApproval = searchParams.get('forApproval') === 'true'

    const where: {
      employeeId?: string | { in: string[] }
      status?: (typeof WFH_STATUSES)[number] | { in: (typeof WFH_STATUSES)[number][] }
    } = {}

    if (employeeId === 'me') {
      where.employeeId = user.id
    } else if (employeeId) {
      if (!isAdminRole(user.role) && employeeId !== user.id) {
        const canSee = await userCanSeeEmployeeWfh(user.id, employeeId)
        if (!canSee) {
          return NextResponse.json({ error: 'Not authorized to view these requests' }, { status: 403 })
        }
      }
      where.employeeId = employeeId
    }

    if (status) {
      const parsedStatus = wfhStatusSchema.safeParse(status)
      if (!parsedStatus.success) {
        return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 })
      }
      where.status = parsedStatus.data
    }

    if (forApproval && isAdminRole(user.role)) {
      where.status = { in: ['PENDING', 'LEAD_APPROVED'] }
    }

    if (forApproval && !isAdminRole(user.role)) {
      const leadMappings = await prisma.evaluatorMapping.findMany({
        where: {
          evaluatorId: user.id,
          relationshipType: 'TEAM_LEAD',
        },
        select: { evaluateeId: true },
      })

      const teamMemberIds = leadMappings.map((mapping) => mapping.evaluateeId)
      if (teamMemberIds.length === 0) {
        return NextResponse.json({ requests: [] })
      }

      const requests = await prisma.wfhRequest.findMany({
        where: {
          employeeId: { in: teamMemberIds },
          status: { in: ['PENDING', 'HR_APPROVED'] },
        },
        include: {
          employee: {
            select: { id: true, name: true, department: true, position: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      return NextResponse.json({ requests })
    }

    const requests = await prisma.wfhRequest.findMany({
      where,
      include: {
        employee: {
          select: { id: true, name: true, department: true, position: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ requests })
  } catch (error) {
    console.error('Failed to fetch WFH requests:', error)
    return NextResponse.json({ error: 'Failed to fetch WFH requests' }, { status: 500 })
  }
}

// POST - Create WFH request
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = wfhRequestCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid WFH request payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const { startDate, endDate, reason, workPlan, requestTimezone, employeeId } = parsed.data
    const isHR = isAdminRole(user.role)
    const targetEmployeeId = employeeId?.trim() || user.id
    const isOnBehalfRequest = targetEmployeeId !== user.id

    if (isOnBehalfRequest && !isHR) {
      return NextResponse.json({ error: 'Only HR can create WFH for another employee' }, { status: 403 })
    }

    if (!isValidWfhDateRange(startDate, endDate)) {
      return NextResponse.json({ error: 'End date must be on or after start date' }, { status: 400 })
    }

    const targetEmployee = await prisma.user.findUnique({
      where: { id: targetEmployeeId },
      select: { id: true, department: true },
    })

    if (!targetEmployee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    if (!canRequestWfh(targetEmployee.department)) {
      return NextResponse.json({ error: 'WFH requests are only available for 3E team members' }, { status: 403 })
    }

    const daysRequested = calculateWfhDays(startDate, endDate)
    if (daysRequested <= 0) {
      return NextResponse.json(
        { error: 'Selected range does not include any working WFH days (Mon-Fri).' },
        { status: 400 }
      )
    }

    const superiorLeadCount = await prisma.evaluatorMapping.count({
      where: {
        evaluateeId: targetEmployeeId,
        relationshipType: 'TEAM_LEAD',
      },
    })

    const requiresLeadApproval = wfhRequiresLeadApproval(superiorLeadCount)
    const normalizedRequestTimezone = normalizeLeaveTimeZone(requestTimezone)
    const safeWorkPlan = workPlan?.trim() || null

    const wfhRequest = await prisma.$transaction(async (tx) => {
      if (isOnBehalfRequest && isHR) {
        return tx.wfhRequest.create({
          data: {
            employeeId: targetEmployeeId,
            requestTimezone: normalizedRequestTimezone,
            startDate,
            endDate,
            reason,
            workPlan: safeWorkPlan,
            status: requiresLeadApproval ? 'HR_APPROVED' : 'APPROVED',
            hrApprovedBy: user.id,
            hrApprovedAt: new Date(),
            hrComment: 'Entered by HR on behalf of employee',
          },
          include: {
            employee: {
              select: { id: true, name: true, department: true, position: true },
            },
          },
        })
      }

      return tx.wfhRequest.create({
        data: {
          employeeId: targetEmployeeId,
          requestTimezone: normalizedRequestTimezone,
          startDate,
          endDate,
          reason,
          workPlan: safeWorkPlan,
        },
        include: {
          employee: {
            select: { id: true, name: true, department: true, position: true },
          },
        },
      })
    })

    return NextResponse.json({ success: true, request: wfhRequest })
  } catch (error) {
    console.error('Failed to create WFH request:', error)
    return NextResponse.json({ error: 'Failed to create WFH request' }, { status: 500 })
  }
}

// PUT - Update WFH request
export async function PUT(request: NextRequest) {
  try {
    const user = await getSession()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = wfhRequestUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid WFH update payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const { id, startDate, endDate, reason, workPlan, requestTimezone } = parsed.data
    const existing = await prisma.wfhRequest.findUnique({
      where: { id },
      include: {
        employee: {
          select: { id: true, department: true },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'WFH request not found' }, { status: 404 })
    }

    if (existing.employeeId !== user.id && !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Not authorized to edit this request' }, { status: 403 })
    }

    if (!['PENDING', 'LEAD_APPROVED', 'HR_APPROVED'].includes(existing.status)) {
      return NextResponse.json({ error: 'This WFH request can no longer be edited' }, { status: 400 })
    }

    if (!canRequestWfh(existing.employee.department)) {
      return NextResponse.json({ error: 'WFH requests are only available for 3E team members' }, { status: 403 })
    }

    if (!isValidWfhDateRange(startDate, endDate)) {
      return NextResponse.json({ error: 'End date must be on or after start date' }, { status: 400 })
    }

    const daysRequested = calculateWfhDays(startDate, endDate)
    if (daysRequested <= 0) {
      return NextResponse.json(
        { error: 'Selected range does not include any working WFH days (Mon-Fri).' },
        { status: 400 }
      )
    }

    const updated = await prisma.wfhRequest.update({
      where: { id },
      data: {
        startDate,
        endDate,
        reason,
        workPlan: workPlan?.trim() || null,
        requestTimezone: normalizeLeaveTimeZone(requestTimezone),
        status: 'PENDING',
        leadApprovedBy: null,
        leadApprovedAt: null,
        leadComment: null,
        hrApprovedBy: null,
        hrApprovedAt: null,
        hrComment: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
      },
      include: {
        employee: {
          select: { id: true, name: true, department: true, position: true },
        },
      },
    })

    return NextResponse.json({ success: true, request: updated })
  } catch (error) {
    console.error('Failed to update WFH request:', error)
    return NextResponse.json({ error: 'Failed to update WFH request' }, { status: 500 })
  }
}

// DELETE - HR removes permanently, employees cancel their own active request
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSession()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Request ID is required' }, { status: 400 })
    }

    const existing = await prisma.wfhRequest.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'WFH request not found' }, { status: 404 })
    }

    if (isAdminRole(user.role)) {
      await prisma.wfhRequest.delete({ where: { id } })
      return NextResponse.json({ success: true })
    }

    if (existing.employeeId !== user.id) {
      return NextResponse.json({ error: 'Not authorized to cancel this request' }, { status: 403 })
    }

    if (hasWfhEnded(new Date(existing.endDate))) {
      return NextResponse.json({ error: 'Past WFH requests cannot be cancelled' }, { status: 400 })
    }

    if (existing.status === 'REJECTED') {
      return NextResponse.json({ error: 'Rejected WFH requests cannot be cancelled' }, { status: 400 })
    }

    if (existing.status === 'CANCELLED') {
      return NextResponse.json({ success: true, status: 'CANCELLED' })
    }

    await prisma.wfhRequest.update({
      where: { id },
      data: {
        status: 'CANCELLED',
      },
    })

    return NextResponse.json({ success: true, status: 'CANCELLED' })
  } catch (error) {
    console.error('Failed to delete WFH request:', error)
    return NextResponse.json({ error: 'Failed to delete WFH request' }, { status: 500 })
  }
}

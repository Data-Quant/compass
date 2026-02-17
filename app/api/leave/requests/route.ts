import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { sendLeaveRequestNotification } from '@/lib/email'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { calculateLeaveDays, isValidLeaveDateRange } from '@/lib/leave-utils'
import { isAdminRole } from '@/lib/permissions'

const LEAVE_TYPES = ['CASUAL', 'SICK', 'ANNUAL'] as const
const LEAVE_STATUSES = ['PENDING', 'LEAD_APPROVED', 'HR_APPROVED', 'APPROVED', 'REJECTED', 'CANCELLED'] as const

const optionalIdSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional().nullable()
)

const optionalTransitionPlanSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().max(6000).optional().nullable()
)

const leaveRequestCreateSchema = z.object({
  leaveType: z.enum(LEAVE_TYPES),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().trim().min(1).max(4000),
  transitionPlan: optionalTransitionPlanSchema,
  employeeId: optionalIdSchema,
  coverPersonId: optionalIdSchema,
  additionalNotifyIds: z.array(z.string().trim().min(1)).max(20).optional(),
}).refine(
  (data) => isValidLeaveDateRange(data.startDate, data.endDate),
  {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  }
)

const leaveRequestUpdateSchema = z.object({
  id: z.string().trim().min(1),
  leaveType: z.enum(LEAVE_TYPES),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().trim().min(1).max(4000),
  transitionPlan: optionalTransitionPlanSchema,
  coverPersonId: optionalIdSchema,
  additionalNotifyIds: z.array(z.string().trim().min(1)).max(20).optional(),
}).refine(
  (data) => isValidLeaveDateRange(data.startDate, data.endDate),
  {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  }
)

const leaveStatusSchema = z.enum(LEAVE_STATUSES)

// GET - List leave requests
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
    const scope = searchParams.get('scope')
    const department = searchParams.get('department')

    // Team upcoming leave feed (used on dashboard)
    if (scope === 'team-upcoming') {
      const leadMappings = await prisma.evaluatorMapping.findMany({
        where: {
          evaluatorId: user.id,
          relationshipType: 'TEAM_LEAD',
        },
        select: { evaluateeId: true },
      })

      const teamMemberIds = leadMappings.map((m) => m.evaluateeId)
      if (teamMemberIds.length === 0) {
        return NextResponse.json({ requests: [] })
      }

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const requests = await prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: teamMemberIds },
          status: { in: ['PENDING', 'LEAD_APPROVED', 'HR_APPROVED', 'APPROVED'] },
          endDate: { gte: today },
          ...(department ? { employee: { department } } : {}),
        },
        include: {
          employee: {
            select: { id: true, name: true, department: true, position: true },
          },
          coverPerson: {
            select: { id: true, name: true },
          },
        },
        orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
      })

      return NextResponse.json({ requests })
    }
    
    // Build where clause
    const where: {
      employeeId?: string | { in: string[] }
      status?: (typeof LEAVE_STATUSES)[number] | { in: (typeof LEAVE_STATUSES)[number][] }
    } = {}
    
    if (employeeId === 'me') {
      where.employeeId = user.id
    } else if (employeeId) {
      // Non-admin users can only see their own requests or team members they lead
      if (!isAdminRole(user.role) && employeeId !== user.id) {
        const leadMappings = await prisma.evaluatorMapping.findMany({
          where: {
            evaluatorId: user.id,
            relationshipType: 'TEAM_LEAD',
          },
          select: { evaluateeId: true },
        })
        const teamMemberIds = leadMappings.map(m => m.evaluateeId)
        if (!teamMemberIds.includes(employeeId)) {
          return NextResponse.json({ error: 'Not authorized to view these requests' }, { status: 403 })
        }
      }
      where.employeeId = employeeId
    }
    
    if (status) {
      const parsedStatus = leaveStatusSchema.safeParse(status)
      if (!parsedStatus.success) {
        return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 })
      }
      where.status = parsedStatus.data
    }
    
    // If admin user wants to see requests pending their approval
    if (forApproval && isAdminRole(user.role)) {
      where.status = { in: ['PENDING', 'LEAD_APPROVED'] }
    }
    
    // If non-admin user (lead) wants to see requests for their team
    if (forApproval && !isAdminRole(user.role)) {
      // Get people this user leads (TEAM_LEAD relationship)
      const leadMappings = await prisma.evaluatorMapping.findMany({
        where: {
          evaluatorId: user.id,
          relationshipType: 'TEAM_LEAD',
        },
        select: { evaluateeId: true },
      })
      
      const teamMemberIds = leadMappings.map(m => m.evaluateeId)
      where.employeeId = { in: teamMemberIds }
      where.status = { in: ['PENDING', 'HR_APPROVED'] }
    }
    
    const requests = await prisma.leaveRequest.findMany({
      where,
      include: {
        employee: {
          select: { id: true, name: true, department: true, position: true },
        },
        coverPerson: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    
    return NextResponse.json({ requests })
  } catch (error) {
    console.error('Failed to fetch leave requests:', error)
    return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 })
  }
}

// POST - Create leave request
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const body = await request.json()
    const parsed = leaveRequestCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid leave request payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const { leaveType, startDate, endDate, reason, transitionPlan, coverPersonId, additionalNotifyIds, employeeId } = parsed.data
    const isHR = isAdminRole(user.role)

    // HR can create leave on behalf of any employee; default remains self-service.
    const targetEmployeeId = employeeId?.trim() || user.id
    const isOnBehalfRequest = targetEmployeeId !== user.id

    if (isOnBehalfRequest && !isHR) {
      return NextResponse.json({ error: 'Only HR can create leave for another employee' }, { status: 403 })
    }

    if (coverPersonId && coverPersonId === targetEmployeeId) {
      return NextResponse.json({ error: 'Cover person cannot be the same as the employee' }, { status: 400 })
    }

    // Ensure employee exists when HR enters leave on behalf.
    if (isOnBehalfRequest || coverPersonId) {
      const idsToCheck = [targetEmployeeId, coverPersonId].filter(Boolean) as string[]
      const users = await prisma.user.findMany({
        where: { id: { in: idsToCheck } },
        select: { id: true },
      })
      const found = new Set(users.map((u) => u.id))
      if (!found.has(targetEmployeeId)) {
        return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
      }
      if (coverPersonId && !found.has(coverPersonId)) {
        return NextResponse.json({ error: 'Cover person not found' }, { status: 404 })
      }
    }
    
    // Calculate days requested
    const start = new Date(startDate)
    const end = new Date(endDate)
    const daysRequested = calculateLeaveDays(start, end)
    if (daysRequested <= 0) {
      return NextResponse.json(
        { error: 'Selected range does not include any working days (Mon-Fri).' },
        { status: 400 }
      )
    }

    // Check leave balance against the leave start year.
    const currentYear = start.getFullYear()
    let balance = await prisma.leaveBalance.findUnique({
      where: {
        employeeId_year: {
          employeeId: targetEmployeeId,
          year: currentYear,
        },
      },
    })
    
    // Create balance if doesn't exist
    if (!balance) {
      balance = await prisma.leaveBalance.create({
        data: {
          employeeId: targetEmployeeId,
          year: currentYear,
        },
      })
    }
    
    // Check if enough balance
    const balanceField = `${leaveType.toLowerCase()}Days` as 'casualDays' | 'sickDays' | 'annualDays'
    const usedField = `${leaveType.toLowerCase()}Used` as 'casualUsed' | 'sickUsed' | 'annualUsed'
    const available = balance[balanceField] - balance[usedField]
    
    if (daysRequested > available) {
      return NextResponse.json({ 
        error: `Insufficient ${leaveType.toLowerCase()} leave balance. Available: ${available} days, Requested: ${daysRequested} days` 
      }, { status: 400 })
    }
    
    // Validate additionalNotifyIds are valid user IDs (optional)
    const validNotifyIds = Array.isArray(additionalNotifyIds)
      ? [...new Set(additionalNotifyIds.filter((id) => id !== targetEmployeeId))]
      : []

    const safeTransitionPlan = transitionPlan?.trim() || ''

    // Create the leave request
    const leaveRequest = await prisma.$transaction(async (tx) => {
      // HR on-behalf entries are auto-approved and immediately reflected in balances.
      if (isOnBehalfRequest && isHR) {
        const usedField = `${leaveType.toLowerCase()}Used` as 'casualUsed' | 'sickUsed' | 'annualUsed'

        await tx.leaveBalance.update({
          where: {
            employeeId_year: {
              employeeId: targetEmployeeId,
              year: currentYear,
            },
          },
          data: {
            [usedField]: { increment: daysRequested },
          },
        })

        return tx.leaveRequest.create({
          data: {
            employeeId: targetEmployeeId,
            leaveType,
            startDate: start,
            endDate: end,
            reason,
            transitionPlan: safeTransitionPlan || 'Entered by HR on behalf of employee',
            coverPersonId: coverPersonId || null,
            ...(validNotifyIds.length > 0 && { additionalNotifyIds: validNotifyIds }),
            status: 'APPROVED',
            hrApprovedBy: user.id,
            hrApprovedAt: new Date(),
            hrComment: 'Entered by HR on behalf of employee',
          },
          include: {
            employee: {
              select: { id: true, name: true, department: true, email: true },
            },
            coverPerson: {
              select: { id: true, name: true },
            },
          },
        })
      }

      return tx.leaveRequest.create({
        data: {
          employeeId: targetEmployeeId,
          leaveType,
          startDate: start,
          endDate: end,
          reason,
          transitionPlan: safeTransitionPlan,
          coverPersonId: coverPersonId || null,
          ...(validNotifyIds.length > 0 && { additionalNotifyIds: validNotifyIds }),
          status: 'PENDING',
        },
        include: {
          employee: {
            select: { id: true, name: true, department: true, email: true },
          },
          coverPerson: {
            select: { id: true, name: true },
          },
        },
      })
    })
    
    // Send notification to HR and Lead
    // HR on-behalf entries are already approved, so no approval-request mail is required.
    if (!(isOnBehalfRequest && isHR)) {
      try {
        await sendLeaveRequestNotification(leaveRequest.id)
      } catch (e) {
        console.error('Failed to send leave request notification:', e)
      }
    }
    
    return NextResponse.json({ success: true, request: leaveRequest })
  } catch (error) {
    console.error('Failed to create leave request:', error)
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 })
  }
}

// PUT - Edit leave request (before final decision)
export async function PUT(request: NextRequest) {
  try {
    const user = await getSession()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = leaveRequestUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid leave request payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const { id, leaveType, startDate, endDate, reason, transitionPlan, coverPersonId, additionalNotifyIds } = parsed.data
    const isHR = isAdminRole(user.role)

    const existing = await prisma.leaveRequest.findUnique({
      where: { id },
      select: {
        id: true,
        employeeId: true,
        status: true,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    if (!isHR && existing.employeeId !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    if (['APPROVED', 'REJECTED', 'CANCELLED'].includes(existing.status)) {
      return NextResponse.json({ error: 'Only pending requests can be edited' }, { status: 400 })
    }

    const targetEmployeeId = existing.employeeId
    if (coverPersonId && coverPersonId === targetEmployeeId) {
      return NextResponse.json({ error: 'Cover person cannot be the same as the employee' }, { status: 400 })
    }

    if (coverPersonId) {
      const coverUser = await prisma.user.findUnique({
        where: { id: coverPersonId },
        select: { id: true },
      })
      if (!coverUser) {
        return NextResponse.json({ error: 'Cover person not found' }, { status: 404 })
      }
    }
    const start = new Date(startDate)
    const end = new Date(endDate)
    const daysRequested = calculateLeaveDays(start, end)
    if (daysRequested <= 0) {
      return NextResponse.json(
        { error: 'Selected range does not include any working days (Mon-Fri).' },
        { status: 400 }
      )
    }
    const balanceYear = start.getFullYear()

    const balance = await prisma.leaveBalance.upsert({
      where: {
        employeeId_year: {
          employeeId: targetEmployeeId,
          year: balanceYear,
        },
      },
      update: {},
      create: {
        employeeId: targetEmployeeId,
        year: balanceYear,
      },
    })

    const balanceField = `${leaveType.toLowerCase()}Days` as 'casualDays' | 'sickDays' | 'annualDays'
    const usedField = `${leaveType.toLowerCase()}Used` as 'casualUsed' | 'sickUsed' | 'annualUsed'
    const available = balance[balanceField] - balance[usedField]

    if (daysRequested > available) {
      return NextResponse.json({
        error: `Insufficient ${leaveType.toLowerCase()} leave balance. Available: ${available} days, Requested: ${daysRequested} days`,
      }, { status: 400 })
    }

    const validNotifyIds = Array.isArray(additionalNotifyIds)
      ? [...new Set(additionalNotifyIds.filter((notifyId) => notifyId !== targetEmployeeId))]
      : []

    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        leaveType,
        startDate: start,
        endDate: end,
        reason,
        transitionPlan: transitionPlan?.trim() || '',
        coverPersonId: coverPersonId || null,
        additionalNotifyIds: validNotifyIds.length > 0 ? validNotifyIds : Prisma.JsonNull,
        // Editing resets approval flow so leads/HR review latest details.
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
          select: { id: true, name: true, department: true, email: true },
        },
        coverPerson: {
          select: { id: true, name: true },
        },
      },
    })

    try {
      await sendLeaveRequestNotification(updated.id)
    } catch (e) {
      console.error('Failed to send leave update notification:', e)
    }

    return NextResponse.json({ success: true, request: updated })
  } catch (error) {
    console.error('Failed to update leave request:', error)
    return NextResponse.json({ error: 'Failed to update request' }, { status: 500 })
  }
}

// DELETE - Cancel leave request
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSession()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { searchParams } = new URL(request.url)
    const requestId = searchParams.get('id')
    
    if (!requestId) {
      return NextResponse.json({ error: 'Request ID required' }, { status: 400 })
    }
    
    // Find the request
    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
    })
    
    if (!leaveRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }
    
    const isHR = isAdminRole(user.role)

    if (isHR) {
      await prisma.$transaction(async (tx) => {
        // Roll back used balance if removing an approved entry.
        if (leaveRequest.status === 'APPROVED') {
          const start = new Date(leaveRequest.startDate)
          const end = new Date(leaveRequest.endDate)
          const daysUsed = calculateLeaveDays(start, end)
          const usedField = `${leaveRequest.leaveType.toLowerCase()}Used` as 'casualUsed' | 'sickUsed' | 'annualUsed'

          const balance = await tx.leaveBalance.findUnique({
            where: {
              employeeId_year: {
                employeeId: leaveRequest.employeeId,
                year: start.getFullYear(),
              },
            },
          })

          if (balance) {
            const decrementBy = Math.min(balance[usedField], daysUsed)
            if (decrementBy > 0) {
              await tx.leaveBalance.update({
                where: {
                  employeeId_year: {
                    employeeId: leaveRequest.employeeId,
                    year: start.getFullYear(),
                  },
                },
                data: {
                  [usedField]: { decrement: decrementBy },
                },
              })
            }
          }
        }

        await tx.leaveRequest.delete({
          where: { id: requestId },
        })
      })

      return NextResponse.json({ success: true })
    }

    // Non-HR users can only cancel their own request.
    if (leaveRequest.employeeId !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Self-cancel is only allowed for non-approved requests.
    if (leaveRequest.status === 'APPROVED') {
      return NextResponse.json({ error: 'Cannot cancel approved request' }, { status: 400 })
    }

    await prisma.leaveRequest.update({
      where: { id: requestId },
      data: { status: 'CANCELLED' },
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to cancel leave request:', error)
    return NextResponse.json({ error: 'Failed to cancel request' }, { status: 500 })
  }
}

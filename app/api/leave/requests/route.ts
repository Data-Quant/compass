import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { sendLeaveRequestNotification } from '@/lib/email'
import { z } from 'zod'
import { calculateLeaveDays, isValidLeaveDateRange } from '@/lib/leave-utils'
import { isAdminRole } from '@/lib/permissions'

const LEAVE_TYPES = ['CASUAL', 'SICK', 'ANNUAL'] as const
const LEAVE_STATUSES = ['PENDING', 'LEAD_APPROVED', 'HR_APPROVED', 'APPROVED', 'REJECTED', 'CANCELLED'] as const

const leaveRequestCreateSchema = z.object({
  leaveType: z.enum(LEAVE_TYPES),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().trim().min(1).max(4000),
  transitionPlan: z.string().trim().max(6000).optional().nullable(),
  employeeId: z.string().trim().min(1).optional().nullable(),
  coverPersonId: z.string().trim().min(1).optional().nullable(),
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

    // Transition plan is required for self-submitted leave requests.
    if (!isOnBehalfRequest && !transitionPlan?.trim()) {
      return NextResponse.json({ error: 'Transition plan is required' }, { status: 400 })
    }

    // Ensure employee exists when HR enters leave on behalf.
    if (isOnBehalfRequest) {
      const employee = await prisma.user.findUnique({
        where: { id: targetEmployeeId },
        select: { id: true },
      })
      if (!employee) {
        return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
      }
    }
    
    // Calculate days requested
    const start = new Date(startDate)
    const end = new Date(endDate)
    const daysRequested = calculateLeaveDays(start, end)
    
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
      ? additionalNotifyIds
      : []

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
            transitionPlan: transitionPlan?.trim() || 'Entered by HR on behalf of employee',
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
          transitionPlan: transitionPlan?.trim() || '',
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

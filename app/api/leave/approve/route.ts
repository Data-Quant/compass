import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { sendLeaveApprovalNotification, sendLeaveCancellationNotification } from '@/lib/email'
import { LeaveStatus, Prisma } from '@prisma/client'
import { z } from 'zod'
import { calculateLeaveDuration, leaveHasStarted } from '@/lib/leave-utils'
import { restoreUnstartedLeaveBalance } from '@/lib/leave-balance'
import { isAdminRole } from '@/lib/permissions'
import { removeLeaveCalendarEvent, syncLeaveCalendarEvent } from '@/lib/google-calendar'
import { stripHtml } from '@/lib/sanitize'

const leaveApprovalSchema = z.object({
  requestId: z.string().trim().min(1),
  action: z.enum(['approve', 'reject']),
  comment: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => (typeof value === 'string' ? stripHtml(value) : value)),
})

// POST - Approve or reject a leave request
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const body = await request.json()
    const parsed = leaveApprovalSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request payload', details: parsed.error.errors }, { status: 400 })
    }
    
    const { requestId, action, comment } = parsed.data
    
    // Get the leave request
    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: {
        employee: {
          select: { id: true, name: true, email: true },
        },
      },
    })
    
    if (!leaveRequest) {
      return NextResponse.json({ error: 'Leave request not found' }, { status: 404 })
    }

    const isHR = isAdminRole(user.role)

    // Half-day sick leave is HR-only.
    if (leaveRequest.isHalfDay && leaveRequest.leaveType === 'SICK' && !isHR) {
      return NextResponse.json({ error: 'Half-day sick leave requests are approved by HR only' }, { status: 403 })
    }

    // Check if user is a lead for this employee (if not HR)
    let isLead = false
    if (!isHR) {
      const leadMapping = await prisma.evaluatorMapping.findFirst({
        where: {
          evaluatorId: user.id,
          evaluateeId: leaveRequest.employeeId,
          relationshipType: 'TEAM_LEAD',
        },
      })
      isLead = !!leadMapping
    }
    
    // Must be HR or lead to approve
    if (!isHR && !isLead) {
      return NextResponse.json({ error: 'Not authorized to approve this request' }, { status: 403 })
    }
    
    // Handle rejection / disapproval
    if (action === 'reject') {
      if (leaveRequest.status === 'CANCELLED') {
        return NextResponse.json({ error: 'Cannot reject a cancelled request' }, { status: 400 })
      }
      if (leaveRequest.status === 'REJECTED') {
        try {
          await removeLeaveCalendarEvent(requestId)
        } catch (e) {
          console.error('Failed to remove already-rejected leave from Google Calendar:', e)
        }
        return NextResponse.json({ success: true, status: 'REJECTED' })
      }

      // Disapproving an already-finalized (APPROVED) leave cancels it: restore
      // the balance and remove the calendar invite — but only if it has not been
      // availed yet. Once the leave has started, those days are committed.
      if (leaveRequest.status === 'APPROVED') {
        if (leaveHasStarted(new Date(leaveRequest.startDate))) {
          return NextResponse.json(
            { error: 'This leave has already started or been taken and cannot be reversed. Contact HR for any correction.' },
            { status: 400 }
          )
        }

        await prisma.$transaction(async (tx) => {
          await restoreUnstartedLeaveBalance(tx, leaveRequest)
          await tx.leaveRequest.update({
            where: { id: requestId },
            data: {
              status: 'CANCELLED',
              rejectedBy: user.id,
              rejectedAt: new Date(),
              rejectionReason: comment || null,
            },
          })
        })

        try {
          await removeLeaveCalendarEvent(requestId)
        } catch (e) {
          console.error('Failed to remove cancelled leave from Google Calendar:', e)
        }
        try {
          await sendLeaveCancellationNotification(requestId, user.name, comment)
        } catch (e) {
          console.error('Failed to send leave cancellation notification:', e)
        }

        return NextResponse.json({ success: true, status: 'CANCELLED' })
      }

      // Plain rejection of a not-yet-finalized request (no balance was deducted).
      await prisma.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          rejectedBy: user.id,
          rejectedAt: new Date(),
          rejectionReason: comment || null,
        },
      })

      try {
        await removeLeaveCalendarEvent(requestId)
      } catch (e) {
        console.error('Failed to remove rejected leave from Google Calendar:', e)
      }

      try {
        await sendLeaveApprovalNotification(requestId, 'rejected', user.name, comment)
      } catch (e) {
        console.error('Failed to send rejection notification:', e)
      }

      return NextResponse.json({ success: true, status: 'REJECTED' })
    }
    
    // Handle approval
    if (action === 'approve') {
      if (leaveRequest.status === 'APPROVED') {
        try {
          await syncLeaveCalendarEvent(requestId)
        } catch (e) {
          console.error('Failed to sync already-approved leave to Google Calendar:', e)
        }
        return NextResponse.json({ success: true, status: 'APPROVED' })
      }
      if (leaveRequest.status === 'REJECTED' || leaveRequest.status === 'CANCELLED') {
        return NextResponse.json({ error: `Cannot approve a ${leaveRequest.status.toLowerCase()} request` }, { status: 400 })
      }

      let newStatus: LeaveStatus = leaveRequest.status
      const updateData: Prisma.LeaveRequestUpdateInput = {}
      
      if (isHR) {
        updateData.hrApprovedBy = user.id
        updateData.hrApprovedAt = new Date()
        updateData.hrComment = comment || null

        // HR approval finalizes the leave on its own (balance deducted +
        // calendar invite created), regardless of lead approval. A lead can
        // still disapprove afterwards, which cancels it.
        newStatus = 'APPROVED'
      } else if (isLead) {
        if (leaveRequest.status === 'LEAD_APPROVED' && leaveRequest.leadApprovedBy) {
          return NextResponse.json({ success: true, status: 'LEAD_APPROVED' })
        }

        updateData.leadApprovedBy = user.id
        updateData.leadApprovedAt = new Date()
        updateData.leadComment = comment || null
        
        // Check if HR has already approved
        if (leaveRequest.status === 'HR_APPROVED' || leaveRequest.hrApprovedBy) {
          newStatus = 'APPROVED'
        } else {
          newStatus = 'LEAD_APPROVED'
        }
      }
      
      updateData.status = newStatus

      // If fully approved, atomically update request + leave balance.
      if (newStatus === 'APPROVED') {
        const start = new Date(leaveRequest.startDate)
        const end = new Date(leaveRequest.endDate)
        const daysUsed = calculateLeaveDuration(start, end, leaveRequest.isHalfDay)
        if (daysUsed <= 0) {
          return NextResponse.json(
            { error: 'Selected leave range does not include any working leave duration (Mon-Fri).' },
            { status: 400 }
          )
        }
        const balanceYear = start.getFullYear()
        const usedField = `${leaveRequest.leaveType.toLowerCase()}Used` as 'casualUsed' | 'sickUsed' | 'annualUsed'
        const totalField = `${leaveRequest.leaveType.toLowerCase()}Days` as 'casualDays' | 'sickDays' | 'annualDays'

        const result = await prisma.$transaction(async (tx) => {
          const requestUpdate = await tx.leaveRequest.updateMany({
            where: {
              id: requestId,
              status: { in: ['PENDING', 'LEAD_APPROVED', 'HR_APPROVED'] },
            },
            data: updateData,
          })

          if (requestUpdate.count === 0) {
            return { alreadyFinalized: true }
          }

          const balance = await tx.leaveBalance.upsert({
            where: {
              employeeId_year: {
                employeeId: leaveRequest.employeeId,
                year: balanceYear,
              },
            },
            update: {},
            create: {
              employeeId: leaveRequest.employeeId,
              year: balanceYear,
            },
          })

          const available = balance[totalField] - balance[usedField]
          if (daysUsed > available) {
            throw new Error(
              `Insufficient ${leaveRequest.leaveType.toLowerCase()} leave balance at approval time. Available: ${available}, required: ${daysUsed}`
            )
          }

          await tx.leaveBalance.update({
            where: {
              employeeId_year: {
                employeeId: leaveRequest.employeeId,
                year: balanceYear,
              },
            },
            data: {
              [usedField]: { increment: daysUsed },
            },
          })

          return { alreadyFinalized: false }
        })

        if (!result.alreadyFinalized) {
          // Send approval notification
          try {
            await sendLeaveApprovalNotification(requestId, 'approved', user.name, comment)
          } catch (e) {
            console.error('Failed to send approval notification:', e)
          }
        }
      } else {
        await prisma.leaveRequest.updateMany({
          where: {
            id: requestId,
            status: { in: ['PENDING', 'LEAD_APPROVED', 'HR_APPROVED'] },
          },
          data: updateData,
        })
      }

      try {
        await syncLeaveCalendarEvent(requestId)
      } catch (e) {
        console.error('Failed to sync approved leave to Google Calendar:', e)
      }
      
      return NextResponse.json({ success: true, status: newStatus })
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Insufficient')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Failed to process approval:', error)
    return NextResponse.json({ error: 'Failed to process approval' }, { status: 500 })
  }
}

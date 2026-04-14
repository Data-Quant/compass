import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { LeaveStatus, Prisma } from '@prisma/client'
import { z } from 'zod'
import { isAdminRole } from '@/lib/permissions'
import { wfhRequiresLeadApproval } from '@/lib/wfh-utils'
import { sendWfhApprovalNotification } from '@/lib/email'

const wfhApprovalSchema = z.object({
  requestId: z.string().trim().min(1),
  action: z.enum(['approve', 'reject']),
  comment: z.string().trim().max(2000).optional(),
})

// POST - Approve or reject a WFH request
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = wfhApprovalSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request payload', details: parsed.error.errors }, { status: 400 })
    }

    const { requestId, action, comment } = parsed.data

    const wfhRequest = await prisma.wfhRequest.findUnique({
      where: { id: requestId },
      include: {
        employee: {
          select: { id: true, name: true, department: true, email: true },
        },
      },
    })

    if (!wfhRequest) {
      return NextResponse.json({ error: 'WFH request not found' }, { status: 404 })
    }

    const superiorLeadCount = await prisma.evaluatorMapping.count({
      where: {
        evaluateeId: wfhRequest.employeeId,
        relationshipType: 'TEAM_LEAD',
      },
    })

    const isHR = isAdminRole(user.role)
    const requiresLeadApproval = wfhRequiresLeadApproval(superiorLeadCount)

    let isLead = false
    if (!isHR) {
      const leadMapping = await prisma.evaluatorMapping.findFirst({
        where: {
          evaluatorId: user.id,
          evaluateeId: wfhRequest.employeeId,
          relationshipType: 'TEAM_LEAD',
        },
      })
      isLead = Boolean(leadMapping)
    }

    if (!isHR && !isLead) {
      return NextResponse.json({ error: 'Not authorized to approve this WFH request' }, { status: 403 })
    }

    if (action === 'reject') {
      if (wfhRequest.status === 'APPROVED' || wfhRequest.status === 'CANCELLED') {
        return NextResponse.json({ error: `Cannot reject a ${wfhRequest.status.toLowerCase()} request` }, { status: 400 })
      }

      if (wfhRequest.status === 'REJECTED') {
        return NextResponse.json({ success: true, status: 'REJECTED' })
      }

      await prisma.wfhRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          rejectedBy: user.id,
          rejectedAt: new Date(),
          rejectionReason: comment || null,
        },
      })

      try {
        await sendWfhApprovalNotification(requestId, 'rejected', user.name, comment)
      } catch (error) {
        console.error('Failed to send WFH rejection notification:', error)
      }

      return NextResponse.json({ success: true, status: 'REJECTED' })
    }

    if (action === 'approve') {
      if (wfhRequest.status === 'APPROVED') {
        return NextResponse.json({ success: true, status: 'APPROVED' })
      }

      if (wfhRequest.status === 'REJECTED' || wfhRequest.status === 'CANCELLED') {
        return NextResponse.json({ error: `Cannot approve a ${wfhRequest.status.toLowerCase()} request` }, { status: 400 })
      }

      let newStatus: LeaveStatus = wfhRequest.status
      const updateData: Prisma.WfhRequestUpdateInput = {}

      if (isHR) {
        if (wfhRequest.status === 'HR_APPROVED' && wfhRequest.hrApprovedBy) {
          return NextResponse.json({ success: true, status: 'HR_APPROVED' })
        }

        updateData.hrApprovedBy = user.id
        updateData.hrApprovedAt = new Date()
        updateData.hrComment = comment || null

        if (wfhRequest.status === 'LEAD_APPROVED' || wfhRequest.leadApprovedBy) {
          newStatus = 'APPROVED'
        } else {
          newStatus = requiresLeadApproval ? 'HR_APPROVED' : 'APPROVED'
        }
      } else if (isLead) {
        if (wfhRequest.status === 'LEAD_APPROVED' && wfhRequest.leadApprovedBy) {
          return NextResponse.json({ success: true, status: 'LEAD_APPROVED' })
        }

        updateData.leadApprovedBy = user.id
        updateData.leadApprovedAt = new Date()
        updateData.leadComment = comment || null

        if (wfhRequest.status === 'HR_APPROVED' || wfhRequest.hrApprovedBy) {
          newStatus = 'APPROVED'
        } else {
          newStatus = 'LEAD_APPROVED'
        }
      }

      updateData.status = newStatus

      await prisma.wfhRequest.updateMany({
        where: {
          id: requestId,
          status: { in: ['PENDING', 'LEAD_APPROVED', 'HR_APPROVED'] },
        },
        data: updateData,
      })

      if (newStatus === 'APPROVED') {
        try {
          await sendWfhApprovalNotification(requestId, 'approved', user.name, comment)
        } catch (error) {
          console.error('Failed to send WFH approval notification:', error)
        }
      }

      return NextResponse.json({ success: true, status: newStatus })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Failed to process WFH approval:', error)
    return NextResponse.json({ error: 'Failed to process WFH approval' }, { status: 500 })
  }
}

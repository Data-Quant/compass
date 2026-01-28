import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { sendLeaveApprovalNotification } from '@/lib/email'

// POST - Approve or reject a leave request
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const body = await request.json()
    
    const { requestId, action, comment } = body // action: 'approve' or 'reject'
    
    if (!requestId || !action) {
      return NextResponse.json({ error: 'Request ID and action required' }, { status: 400 })
    }
    
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
    
    const isHR = user.role === 'HR'
    
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
    
    // Handle rejection
    if (action === 'reject') {
      await prisma.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          rejectedBy: user.id,
          rejectedAt: new Date(),
          rejectionReason: comment || null,
        },
      })
      
      // Send notification
      try {
        await sendLeaveApprovalNotification(requestId, 'rejected', user.name, comment)
      } catch (e) {
        console.error('Failed to send rejection notification:', e)
      }
      
      return NextResponse.json({ success: true, status: 'REJECTED' })
    }
    
    // Handle approval
    if (action === 'approve') {
      let newStatus = leaveRequest.status
      const updateData: any = {}
      
      if (isHR) {
        updateData.hrApprovedBy = user.id
        updateData.hrApprovedAt = new Date()
        updateData.hrComment = comment || null
        
        // Check if lead has already approved
        if (leaveRequest.status === 'LEAD_APPROVED' || leaveRequest.leadApprovedBy) {
          newStatus = 'APPROVED'
        } else {
          newStatus = 'HR_APPROVED'
        }
      } else if (isLead) {
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
      
      await prisma.leaveRequest.update({
        where: { id: requestId },
        data: updateData,
      })
      
      // If fully approved, deduct from balance
      if (newStatus === 'APPROVED') {
        const start = new Date(leaveRequest.startDate)
        const end = new Date(leaveRequest.endDate)
        const daysUsed = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
        
        const currentYear = new Date().getFullYear()
        const usedField = `${leaveRequest.leaveType.toLowerCase()}Used` as 'casualUsed' | 'sickUsed' | 'annualUsed'
        
        await prisma.leaveBalance.update({
          where: {
            employeeId_year: {
              employeeId: leaveRequest.employeeId,
              year: currentYear,
            },
          },
          data: {
            [usedField]: { increment: daysUsed },
          },
        })
        
        // Send approval notification
        try {
          await sendLeaveApprovalNotification(requestId, 'approved', user.name, comment)
        } catch (e) {
          console.error('Failed to send approval notification:', e)
        }
      }
      
      return NextResponse.json({ success: true, status: newStatus })
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Failed to process approval:', error)
    return NextResponse.json({ error: 'Failed to process approval' }, { status: 500 })
  }
}

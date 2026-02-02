import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { sendLeaveRequestNotification } from '@/lib/email'

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
    const where: any = {}
    
    if (employeeId === 'me') {
      where.employeeId = user.id
    } else if (employeeId) {
      where.employeeId = employeeId
    }
    
    if (status) {
      where.status = status
    }
    
    // If HR user wants to see requests pending their approval
    if (forApproval && user.role === 'HR') {
      where.status = { in: ['PENDING', 'LEAD_APPROVED'] }
    }
    
    // If non-HR user (lead) wants to see requests for their team
    if (forApproval && user.role !== 'HR') {
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
    
    const { leaveType, startDate, endDate, reason, transitionPlan, coverPersonId, additionalNotifyIds } = body
    
    // Validate required fields
    if (!leaveType || !startDate || !endDate || !reason || !transitionPlan) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    
    // Calculate days requested
    const start = new Date(startDate)
    const end = new Date(endDate)
    const daysRequested = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    
    // Check leave balance
    const currentYear = new Date().getFullYear()
    let balance = await prisma.leaveBalance.findUnique({
      where: {
        employeeId_year: {
          employeeId: user.id,
          year: currentYear,
        },
      },
    })
    
    // Create balance if doesn't exist
    if (!balance) {
      balance = await prisma.leaveBalance.create({
        data: {
          employeeId: user.id,
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
      ? additionalNotifyIds.filter((id: unknown) => typeof id === 'string' && id.length > 0).slice(0, 20)
      : []

    // Create the leave request
    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        employeeId: user.id,
        leaveType,
        startDate: start,
        endDate: end,
        reason,
        transitionPlan,
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
    
    // Send notification to HR and Lead
    try {
      await sendLeaveRequestNotification(leaveRequest.id)
    } catch (e) {
      console.error('Failed to send leave request notification:', e)
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
    
    // Only the employee can cancel their own request
    if (leaveRequest.employeeId !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
    
    // Can only cancel pending requests
    if (leaveRequest.status === 'APPROVED') {
      return NextResponse.json({ error: 'Cannot cancel approved request' }, { status: 400 })
    }
    
    // Update status to cancelled
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

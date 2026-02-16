import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET - Get team leave calendar data
export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { searchParams } = new URL(request.url)
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth()), 10)
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10)
    
    // Use UTC month bounds so "January 2026" is consistent regardless of server timezone.
    // This ensures backfilled and other leave stored in UTC display correctly.
    const startOfMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
    const endOfMonth = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
    
    // Get all approved/pending leave requests that overlap with this month
    const leaveRequests = await prisma.leaveRequest.findMany({
      where: {
        status: { in: ['APPROVED', 'PENDING', 'LEAD_APPROVED', 'HR_APPROVED'] },
        OR: [
          {
            startDate: { gte: startOfMonth, lte: endOfMonth },
          },
          {
            endDate: { gte: startOfMonth, lte: endOfMonth },
          },
          {
            AND: [
              { startDate: { lte: startOfMonth } },
              { endDate: { gte: endOfMonth } },
            ],
          },
        ],
      },
      include: {
        employee: {
          select: { id: true, name: true, department: true },
        },
      },
      orderBy: { startDate: 'asc' },
    })
    
    // Transform into calendar events
    const events = leaveRequests.map(request => ({
      id: request.id,
      employeeId: request.employeeId,
      employeeName: request.employee.name,
      department: request.employee.department,
      leaveType: request.leaveType,
      startDate: request.startDate.toISOString(),
      endDate: request.endDate.toISOString(),
      status: request.status,
      isCurrentUser: request.employeeId === user.id,
    }))
    
    return NextResponse.json({ events })
  } catch (error) {
    console.error('Failed to fetch calendar data:', error)
    return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 500 })
  }
}

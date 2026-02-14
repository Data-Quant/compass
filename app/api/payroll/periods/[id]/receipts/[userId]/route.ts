import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManagePayroll } from '@/lib/permissions'

interface RouteContext {
  params: Promise<{ id: string; userId: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: periodId, userId } = await context.params
    const receipt = await prisma.payrollReceipt.findFirst({
      where: {
        periodId,
        userId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            department: true,
          },
        },
        envelopes: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!receipt) {
      return NextResponse.json({ error: 'Payroll receipt not found' }, { status: 404 })
    }

    return NextResponse.json({ receipt })
  } catch (error) {
    console.error('Failed to fetch payroll receipt:', error)
    return NextResponse.json({ error: 'Failed to fetch payroll receipt' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManagePayroll } from '@/lib/permissions'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: periodId } = await context.params
    const period = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: {
        createdBy: { select: { id: true, name: true, role: true, email: true } },
        approvedBy: { select: { id: true, name: true, role: true, email: true } },
        inputValues: { orderBy: [{ payrollName: 'asc' }, { componentKey: 'asc' }] },
        computedValues: { orderBy: [{ payrollName: 'asc' }, { metricKey: 'asc' }] },
        expenseEntries: { orderBy: [{ categoryKey: 'asc' }, { payrollName: 'asc' }] },
        receipts: {
          orderBy: [{ payrollName: 'asc' }],
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
            envelopes: { orderBy: { createdAt: 'desc' } },
          },
        },
        approvalEvents: {
          orderBy: { createdAt: 'desc' },
          include: {
            actor: { select: { id: true, name: true, role: true } },
          },
        },
        importBatches: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    })

    if (!period) {
      return NextResponse.json({ error: 'Payroll period not found' }, { status: 404 })
    }

    return NextResponse.json({ period })
  } catch (error) {
    console.error('Failed to fetch payroll period detail:', error)
    return NextResponse.json({ error: 'Failed to fetch payroll period detail' }, { status: 500 })
  }
}

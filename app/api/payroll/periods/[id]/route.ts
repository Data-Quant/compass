import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManagePayroll } from '@/lib/permissions'
import { canDeletePayrollPeriodStatus } from '@/lib/payroll/period-status'

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
        payments: { orderBy: [{ payrollName: 'asc' }, { componentKey: 'asc' }] },
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

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: periodId } = await context.params
    const period = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, label: true, status: true },
    })

    if (!period) {
      return NextResponse.json({ error: 'Payroll period not found' }, { status: 404 })
    }

    if (!canDeletePayrollPeriodStatus(period.status)) {
      return NextResponse.json(
        { error: `Payroll period cannot be deleted in ${period.status} state` },
        { status: 400 }
      )
    }

    await prisma.payrollPeriod.delete({
      where: { id: periodId },
    })

    return NextResponse.json({ success: true, deletedPeriodId: periodId })
  } catch (error) {
    console.error('Failed to delete payroll period:', error)
    return NextResponse.json({ error: 'Failed to delete payroll period' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManagePayroll } from '@/lib/permissions'
import { buildEmployeePayrollHistory } from '@/lib/payroll/employee-history'

interface RouteContext {
  params: Promise<{ id: string }>
}

// Per-employee, month-by-month payroll history: what was paid and under which
// categories, newest period first. Available for both active and offboarded
// employees. Gated to payroll managers (HR + O&A).
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: userId } = await context.params

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    })
    if (!target) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    // Rows are linked by userId once identity mapping has run, but legacy rows may
    // carry only a payrollName. Resolve every payroll name this user is known by
    // so those un-linked rows are still picked up. We only claim un-linked rows
    // (userId === null) by name so we never steal another user's mapped rows.
    const mappings = await prisma.payrollIdentityMapping.findMany({
      where: { userId },
      select: { displayPayrollName: true },
    })
    const knownNames = Array.from(
      new Set([target.name, ...mappings.map((m) => m.displayPayrollName)].filter(Boolean) as string[])
    )

    const rowFilter = {
      OR: [{ userId }, { userId: null, payrollName: { in: knownNames } }],
    }

    const [inputRows, computedRows, receipts] = await Promise.all([
      prisma.payrollInputValue.findMany({
        where: rowFilter,
        select: { periodId: true, componentKey: true, amount: true },
      }),
      prisma.payrollComputedValue.findMany({
        where: rowFilter,
        select: { periodId: true, metricKey: true, amount: true },
      }),
      prisma.payrollReceipt.findMany({
        where: rowFilter,
        select: { periodId: true, id: true, status: true, receiptJson: true },
      }),
    ])

    const periodIds = Array.from(
      new Set([
        ...inputRows.map((r) => r.periodId),
        ...computedRows.map((r) => r.periodId),
        ...receipts.map((r) => r.periodId),
      ])
    )

    const periods = periodIds.length
      ? await prisma.payrollPeriod.findMany({
          where: { id: { in: periodIds } },
          select: { id: true, label: true, periodStart: true, status: true },
        })
      : []

    const history = buildEmployeePayrollHistory({
      periods,
      inputRows,
      computedRows,
      receipts,
    })

    return NextResponse.json({
      employee: { id: target.id, name: target.name },
      history,
    })
  } catch (error) {
    console.error('Failed to fetch payroll history:', error)
    return NextResponse.json({ error: 'Failed to fetch payroll history' }, { status: 500 })
  }
}

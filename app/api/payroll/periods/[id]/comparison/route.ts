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
      select: { id: true, periodStart: true },
    })

    if (!period) {
      return NextResponse.json({ error: 'Payroll period not found' }, { status: 404 })
    }

    // Find the previous period
    const previousPeriod = await prisma.payrollPeriod.findFirst({
      where: { periodStart: { lt: period.periodStart } },
      orderBy: { periodStart: 'desc' },
      select: { id: true, label: true, periodStart: true },
    })

    if (!previousPeriod) {
      return NextResponse.json({
        previousPeriod: null,
        previousInputs: {},
        previousComputed: {},
      })
    }

    // Fetch previous period's input values
    const prevInputs = await prisma.payrollInputValue.findMany({
      where: { periodId: previousPeriod.id },
      select: { payrollName: true, componentKey: true, amount: true },
    })

    // Fetch previous period's computed values
    const prevComputed = await prisma.payrollComputedValue.findMany({
      where: { periodId: previousPeriod.id },
      select: { payrollName: true, metricKey: true, amount: true },
    })

    // Group inputs by payrollName
    const previousInputs: Record<string, Record<string, number>> = {}
    for (const input of prevInputs) {
      if (!previousInputs[input.payrollName]) {
        previousInputs[input.payrollName] = {}
      }
      previousInputs[input.payrollName][input.componentKey] =
        (previousInputs[input.payrollName][input.componentKey] || 0) + input.amount
    }

    // Group computed values by payrollName
    const previousComputed: Record<string, Record<string, number>> = {}
    for (const computed of prevComputed) {
      if (!previousComputed[computed.payrollName]) {
        previousComputed[computed.payrollName] = {}
      }
      previousComputed[computed.payrollName][computed.metricKey] = computed.amount
    }

    return NextResponse.json({
      previousPeriod: {
        id: previousPeriod.id,
        label: previousPeriod.label,
        periodStart: previousPeriod.periodStart,
      },
      previousInputs,
      previousComputed,
    })
  } catch (error) {
    console.error('Failed to fetch payroll comparison:', error)
    return NextResponse.json({ error: 'Failed to fetch payroll comparison' }, { status: 500 })
  }
}

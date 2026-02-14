import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManagePayroll } from '@/lib/permissions'
import { carryForwardPayrollPeriod } from '@/lib/payroll/periods'

const bodySchema = z.object({
  basePeriodId: z.string().trim().min(1).optional(),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: periodId } = await context.params
    const body = await request.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const target = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, periodStart: true, status: true, label: true },
    })
    if (!target) {
      return NextResponse.json({ error: 'Target payroll period not found' }, { status: 404 })
    }
    if (target.status === 'LOCKED') {
      return NextResponse.json({ error: 'Cannot carry-forward into a locked period' }, { status: 400 })
    }

    let basePeriodId = parsed.data.basePeriodId
    if (!basePeriodId) {
      const previousPeriod = await prisma.payrollPeriod.findFirst({
        where: { periodStart: { lt: target.periodStart } },
        orderBy: { periodStart: 'desc' },
        select: { id: true },
      })
      if (!previousPeriod) {
        return NextResponse.json({ error: 'No prior payroll period found to carry forward from' }, { status: 400 })
      }
      basePeriodId = previousPeriod.id
    }

    if (basePeriodId === periodId) {
      return NextResponse.json({ error: 'basePeriodId must be different from target period' }, { status: 400 })
    }

    const result = await carryForwardPayrollPeriod(basePeriodId, periodId, user.id)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Failed to carry-forward payroll period:', error)
    return NextResponse.json({ error: 'Failed to carry-forward payroll period' }, { status: 500 })
  }
}

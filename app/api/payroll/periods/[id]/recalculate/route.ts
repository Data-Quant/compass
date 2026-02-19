import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManagePayroll } from '@/lib/permissions'
import { recalculatePayrollPeriod } from '@/lib/payroll/engine'
import { ensurePayrollMasterDefaults } from '@/lib/payroll/settings'

const recalculateSchema = z.object({
  tolerance: z.coerce.number().positive().optional(),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

const ALLOWED_RECALCULATE_STATUSES = new Set(['DRAFT', 'CALCULATED', 'PARTIAL', 'FAILED'])

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: periodId } = await context.params
    const period = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, status: true },
    })
    if (!period) {
      return NextResponse.json({ error: 'Payroll period not found' }, { status: 404 })
    }

    if (!ALLOWED_RECALCULATE_STATUSES.has(period.status)) {
      return NextResponse.json(
        { error: `Recalculate is not allowed from ${period.status}` },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const parsed = recalculateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const tolerance = parsed.data.tolerance ?? 1
    await ensurePayrollMasterDefaults()
    const result = await recalculatePayrollPeriod(periodId, tolerance)
    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('Failed to recalculate payroll period:', error)
    return NextResponse.json({ error: 'Failed to recalculate payroll period' }, { status: 500 })
  }
}

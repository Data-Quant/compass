import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canManagePayroll } from '@/lib/permissions'
import { carryForwardPayrollPeriod } from '@/lib/payroll/periods'
import { recalculatePayrollPeriod } from '@/lib/payroll/engine'
import { periodLabelFromKey, toPeriodKey } from '@/lib/payroll/normalizers'
import { ensurePayrollMasterDefaults } from '@/lib/payroll/settings'

const createPeriodSchema = z.object({
  label: z.string().trim().min(1).optional(),
  periodStart: z.string().trim().min(1),
  periodEnd: z.string().trim().min(1),
  sourceMode: z.enum(['WORKBOOK', 'MANUAL', 'CARRY_FORWARD']).default('CARRY_FORWARD'),
  basePeriodId: z.string().trim().min(1).optional(),
})

function parseDate(value: string): Date | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

export async function GET() {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const periods = await prisma.payrollPeriod.findMany({
      orderBy: { periodStart: 'desc' },
      include: {
        createdBy: {
          select: { id: true, name: true, role: true },
        },
        approvedBy: {
          select: { id: true, name: true, role: true },
        },
        _count: {
          select: {
            inputValues: true,
            computedValues: true,
            receipts: true,
            expenseEntries: true,
            importBatches: true,
          },
        },
      },
    })

    return NextResponse.json({ periods })
  } catch (error) {
    console.error('Failed to fetch payroll periods:', error)
    return NextResponse.json({ error: 'Failed to fetch payroll periods' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = createPeriodSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const { label, periodStart, periodEnd, sourceMode, basePeriodId } = parsed.data
    const start = parseDate(periodStart)
    const end = parseDate(periodEnd)

    if (!start || !end) {
      return NextResponse.json({ error: 'Invalid period dates' }, { status: 400 })
    }
    if (end < start) {
      return NextResponse.json({ error: 'periodEnd must be on or after periodStart' }, { status: 400 })
    }

    let resolvedBasePeriodId = basePeriodId && basePeriodId !== 'AUTO' ? basePeriodId : undefined
    if (sourceMode === 'CARRY_FORWARD' && !resolvedBasePeriodId) {
      const previousPeriod = await prisma.payrollPeriod.findFirst({
        where: { periodStart: { lt: start } },
        orderBy: { periodStart: 'desc' },
        select: { id: true },
      })
      if (!previousPeriod) {
        return NextResponse.json(
          { error: 'No prior payroll period found to carry forward from' },
          { status: 400 }
        )
      }
      resolvedBasePeriodId = previousPeriod.id
    }

    const periodKey = toPeriodKey(start)
    const created = await prisma.payrollPeriod.create({
      data: {
        label: label || periodLabelFromKey(periodKey),
        periodStart: start,
        periodEnd: end,
        sourceType: sourceMode,
        status: 'DRAFT',
        createdById: user.id,
      },
    })

    let carryForwardSummary: unknown = null
    let recalculationSummary: unknown = null
    if (sourceMode === 'CARRY_FORWARD' && resolvedBasePeriodId) {
      carryForwardSummary = await carryForwardPayrollPeriod(resolvedBasePeriodId, created.id, user.id)
      await ensurePayrollMasterDefaults()
      recalculationSummary = await recalculatePayrollPeriod(created.id)
    }

    const period = await prisma.payrollPeriod.findUnique({
      where: { id: created.id },
    })

    return NextResponse.json({
      success: true,
      period: period || created,
      carryForward: carryForwardSummary,
      recalculation: recalculationSummary,
    })
  } catch (error) {
    console.error('Failed to create payroll period:', error)
    return NextResponse.json({ error: 'Failed to create payroll period' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canEditPayrollMaster, canManagePayroll } from '@/lib/permissions'
import { ensurePayrollMasterDefaults } from '@/lib/payroll/settings'

const createSchema = z.object({
  label: z.string().trim().min(1),
  startDate: z.string().trim().min(1),
  endDate: z.string().trim().min(1),
})

const patchSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  isActive: z.boolean().optional(),
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

    await ensurePayrollMasterDefaults()
    const financialYears = await prisma.payrollFinancialYear.findMany({
      orderBy: { startDate: 'desc' },
      include: {
        taxBrackets: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    })
    return NextResponse.json({ financialYears })
  } catch (error) {
    console.error('Failed to fetch payroll financial years:', error)
    return NextResponse.json({ error: 'Failed to fetch payroll financial years' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canEditPayrollMaster(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.errors }, { status: 400 })
    }

    const startDate = parseDate(parsed.data.startDate)
    const endDate = parseDate(parsed.data.endDate)
    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Invalid startDate/endDate' }, { status: 400 })
    }
    if (endDate < startDate) {
      return NextResponse.json({ error: 'endDate must be >= startDate' }, { status: 400 })
    }

    const financialYear = await prisma.payrollFinancialYear.create({
      data: {
        label: parsed.data.label,
        startDate,
        endDate,
        isActive: false,
      },
    })
    return NextResponse.json({ success: true, financialYear })
  } catch (error) {
    console.error('Failed to create payroll financial year:', error)
    return NextResponse.json({ error: 'Failed to create payroll financial year' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canEditPayrollMaster(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.errors }, { status: 400 })
    }

    const startDateParsed = parsed.data.startDate ? parseDate(parsed.data.startDate) : undefined
    const endDateParsed = parsed.data.endDate ? parseDate(parsed.data.endDate) : undefined
    if (parsed.data.startDate && !startDateParsed) {
      return NextResponse.json({ error: 'Invalid startDate' }, { status: 400 })
    }
    if (parsed.data.endDate && !endDateParsed) {
      return NextResponse.json({ error: 'Invalid endDate' }, { status: 400 })
    }

    const financialYear = await prisma.payrollFinancialYear.update({
      where: { id: parsed.data.id },
      data: {
        label: parsed.data.label,
        startDate: startDateParsed || undefined,
        endDate: endDateParsed || undefined,
        isActive: parsed.data.isActive,
      },
    })
    return NextResponse.json({ success: true, financialYear })
  } catch (error) {
    console.error('Failed to update payroll financial year:', error)
    return NextResponse.json({ error: 'Failed to update payroll financial year' }, { status: 500 })
  }
}

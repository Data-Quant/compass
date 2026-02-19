import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canEditPayrollMaster, canManagePayroll } from '@/lib/permissions'

const createSchema = z.object({
  holidayDate: z.string().trim().min(1),
  name: z.string().trim().min(1).max(160),
  financialYearId: z.string().trim().optional().nullable(),
})

function parseDate(value: string): Date | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const where =
      from && to
        ? {
            holidayDate: {
              gte: new Date(from),
              lte: new Date(to),
            },
          }
        : undefined

    const holidays = await prisma.payrollPublicHoliday.findMany({
      where,
      include: {
        financialYear: {
          select: { id: true, label: true },
        },
      },
      orderBy: { holidayDate: 'asc' },
    })

    return NextResponse.json({ holidays })
  } catch (error) {
    console.error('Failed to fetch payroll public holidays:', error)
    return NextResponse.json({ error: 'Failed to fetch payroll public holidays' }, { status: 500 })
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

    const holidayDate = parseDate(parsed.data.holidayDate)
    if (!holidayDate) {
      return NextResponse.json({ error: 'Invalid holidayDate' }, { status: 400 })
    }

    const holiday = await prisma.payrollPublicHoliday.create({
      data: {
        holidayDate,
        name: parsed.data.name,
        financialYearId: parsed.data.financialYearId || null,
      },
    })

    return NextResponse.json({ success: true, holiday })
  } catch (error) {
    console.error('Failed to create payroll public holiday:', error)
    return NextResponse.json({ error: 'Failed to create payroll public holiday' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canEditPayrollMaster(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    await prisma.payrollPublicHoliday.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete payroll public holiday:', error)
    return NextResponse.json({ error: 'Failed to delete payroll public holiday' }, { status: 500 })
  }
}


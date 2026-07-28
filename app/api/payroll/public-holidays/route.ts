import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManagePayroll } from '@/lib/permissions'
import { ALL_TEAMS } from '@/lib/handbook/teams'
import type { TeamTag } from '@prisma/client'

// At least one team is required. An empty list means "applies to everyone" for
// holidays created before tagging existed, so allowing it here would let a
// mis-saved form silently turn a national holiday company-wide -- and company-wide
// holidays shorten every team's working days, which changes travel allowance.
const teamTagsSchema = z
  .array(z.enum(ALL_TEAMS as unknown as [TeamTag, ...TeamTag[]]))
  .min(1, 'Select at least one team')

const createSchema = z.object({
  holidayDate: z.string().trim().min(1),
  name: z.string().trim().min(1).max(160),
  teamTags: teamTagsSchema,
  financialYearId: z.string().trim().optional().nullable(),
})

const updateSchema = z.object({
  id: z.string().trim().min(1),
  teamTags: teamTagsSchema,
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
    // Payroll managers (HR + O&A) can mark public holidays, which adjusts the
    // working-day count used for attendance and travel proration.
    if (!user || !canManagePayroll(user.role)) {
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
        teamTags: parsed.data.teamTags,
        financialYearId: parsed.data.financialYearId || null,
      },
    })

    return NextResponse.json({ success: true, holiday })
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'P2002') {
      // Uniqueness is date + name, so a clash means the same holiday twice rather
      // than two countries sharing a date.
      return NextResponse.json(
        { error: 'That public holiday already exists on that date' },
        { status: 400 }
      )
    }
    console.error('Failed to create payroll public holiday:', error)
    return NextResponse.json({ error: 'Failed to create payroll public holiday' }, { status: 500 })
  }
}

// PATCH - retag an existing holiday. The seven holidays that predate tagging were
// backfilled to the Pakistan teams by migration; this is how they get corrected.
export async function PATCH(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = updateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.errors }, { status: 400 })
    }

    const holiday = await prisma.payrollPublicHoliday.update({
      where: { id: parsed.data.id },
      data: { teamTags: parsed.data.teamTags },
    })

    return NextResponse.json({ success: true, holiday })
  } catch (error) {
    console.error('Failed to update payroll public holiday:', error)
    return NextResponse.json({ error: 'Failed to update payroll public holiday' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
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


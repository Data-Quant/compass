import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManagePayroll } from '@/lib/permissions'
import { companyWideHolidayDates, workingDaysByTeam } from '@/lib/payroll/attendance-calendar'
import { ALL_TEAMS } from '@/lib/handbook/teams'

const updateItemSchema = z.object({
  userId: z.string().trim().min(1),
  attendanceDate: z.string().trim().min(1),
  status: z.enum(['PRESENT', 'ABSENT', 'PUBLIC_HOLIDAY']).nullable(),
  note: z.string().trim().max(500).optional(),
})

const updateSchema = z.object({
  periodId: z.string().trim().min(1),
  updates: z.array(updateItemSchema).min(1),
})

const EDIT_BLOCKED_STATUSES = new Set(['APPROVED', 'SENDING', 'SENT', 'LOCKED'])

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
    const periodId = searchParams.get('periodId')
    if (!periodId) {
      return NextResponse.json({ error: 'periodId is required' }, { status: 400 })
    }

    const period = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      select: {
        id: true,
        label: true,
        periodStart: true,
        periodEnd: true,
        status: true,
      },
    })
    if (!period) {
      return NextResponse.json({ error: 'Payroll period not found' }, { status: 404 })
    }

    const [entries, holidays, users] = await Promise.all([
      prisma.payrollAttendanceEntry.findMany({
        where: { periodId },
        orderBy: [{ attendanceDate: 'asc' }, { userId: 'asc' }],
      }),
      prisma.payrollPublicHoliday.findMany({
        where: {
          holidayDate: {
            gte: period.periodStart,
            lte: period.periodEnd,
          },
        },
        // teamTags decides who observes the holiday. Selecting them is what lets the
        // grid disable a day for the teams that take it, rather than removing the
        // column for everyone.
        select: { id: true, holidayDate: true, name: true, teamTags: true },
        orderBy: { holidayDate: 'asc' },
      }),
      prisma.user.findMany({ select: { id: true, teamTag: true } }),
    ])

    // Per team, never company-wide: a Moroccan holiday must not shorten the Pakistani
    // month, which is the denominator for their travel allowance.
    const workingDays = workingDaysByTeam({
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      holidays,
      teams: ALL_TEAMS,
    })

    // Days nobody works, so the grid can drop the column outright.
    const closedDates = companyWideHolidayDates(holidays).map((d) => d.toISOString())

    return NextResponse.json({
      period,
      workingDaysByTeam: workingDays,
      closedDates,
      teamTagByUserId: Object.fromEntries(users.map((u) => [u.id, u.teamTag])),
      holidays,
      entries,
    })
  } catch (error) {
    console.error('Failed to fetch payroll attendance:', error)
    return NextResponse.json({ error: 'Failed to fetch payroll attendance' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = updateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.errors }, { status: 400 })
    }

    const period = await prisma.payrollPeriod.findUnique({
      where: { id: parsed.data.periodId },
      select: { id: true, status: true, periodStart: true, periodEnd: true },
    })
    if (!period) {
      return NextResponse.json({ error: 'Payroll period not found' }, { status: 404 })
    }
    if (EDIT_BLOCKED_STATUSES.has(period.status)) {
      return NextResponse.json(
        { error: `Attendance cannot be edited in ${period.status} state` },
        { status: 400 }
      )
    }

    await prisma.$transaction(async (tx) => {
      for (const row of parsed.data.updates) {
        const attendanceDate = parseDate(row.attendanceDate)
        if (!attendanceDate) {
          throw new Error(`Invalid attendanceDate: ${row.attendanceDate}`)
        }

        if (attendanceDate < period.periodStart || attendanceDate > period.periodEnd) {
          throw new Error(`Date ${row.attendanceDate} is outside period range`)
        }

        if (row.status === null) {
          await tx.payrollAttendanceEntry.deleteMany({
            where: {
              userId: row.userId,
              attendanceDate,
            },
          })
          continue
        }

        await tx.payrollAttendanceEntry.upsert({
          where: {
            userId_attendanceDate: {
              userId: row.userId,
              attendanceDate,
            },
          },
          update: {
            periodId: parsed.data.periodId,
            status: row.status,
            note: row.note || null,
            source: 'MANUAL',
            updatedById: user.id,
          },
          create: {
            periodId: parsed.data.periodId,
            userId: row.userId,
            attendanceDate,
            status: row.status,
            note: row.note || null,
            source: 'MANUAL',
            updatedById: user.id,
          },
        })
      }

      await tx.payrollPeriod.update({
        where: { id: parsed.data.periodId },
        data: { status: 'DRAFT' },
      })
    })

    return NextResponse.json({ success: true, updated: parsed.data.updates.length })
  } catch (error) {
    console.error('Failed to update payroll attendance:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update payroll attendance' },
      { status: 500 }
    )
  }
}

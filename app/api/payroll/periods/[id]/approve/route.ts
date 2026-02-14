import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManagePayroll } from '@/lib/permissions'

const approveSchema = z.object({
  comment: z.string().trim().max(2000).optional(),
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
    const period = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, status: true },
    })
    if (!period) {
      return NextResponse.json({ error: 'Payroll period not found' }, { status: 404 })
    }

    if (period.status !== 'CALCULATED') {
      return NextResponse.json(
        { error: `Only CALCULATED periods can be approved. Current status: ${period.status}` },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const parsed = approveSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.payrollPeriod.update({
        where: { id: periodId },
        data: {
          status: 'APPROVED',
          approvedById: user.id,
          approvedAt: new Date(),
        },
      })

      await tx.payrollApprovalEvent.create({
        data: {
          periodId,
          actorId: user.id,
          fromStatus: 'CALCULATED',
          toStatus: 'APPROVED',
          comment: parsed.data.comment || null,
        },
      })

      return next
    })

    return NextResponse.json({ success: true, period: updated })
  } catch (error) {
    console.error('Failed to approve payroll period:', error)
    return NextResponse.json({ error: 'Failed to approve payroll period' }, { status: 500 })
  }
}

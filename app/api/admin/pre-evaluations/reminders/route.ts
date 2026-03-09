import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { sendPreEvaluationLeadPrepNotification } from '@/lib/email'
import { canTriggerPreEvaluation } from '@/lib/pre-evaluation'

const reminderSchema = z.object({
  prepId: z.string().trim().min(1).optional(),
  periodId: z.string().trim().min(1).optional(),
  reminderType: z.enum(['INITIAL', 'SEVEN_DAY', 'ONE_DAY', 'MANUAL_RESEND']).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const parsed = reminderSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const reminderType = parsed.data.reminderType || 'MANUAL_RESEND'
    const eligiblePeriodIds = (
      await prisma.evaluationPeriod.findMany({
        where: {
          startDate: {
            gt: new Date(),
          },
        },
        select: { id: true, startDate: true },
      })
    )
      .filter((period) => canTriggerPreEvaluation(period.startDate))
      .map((period) => period.id)

    const where: Prisma.PreEvaluationLeadPrepWhereInput = parsed.data.prepId
      ? {
          id: parsed.data.prepId,
          periodId: { in: eligiblePeriodIds },
        }
      : parsed.data.periodId
        ? {
            AND: [
              { periodId: parsed.data.periodId },
              { periodId: { in: eligiblePeriodIds } },
            ],
          }
        : {
            completedAt: null,
            periodId: { in: eligiblePeriodIds },
          }

    const preps = await prisma.preEvaluationLeadPrep.findMany({
      where,
      select: { id: true },
    })

    if (preps.length === 0 && (parsed.data.prepId || parsed.data.periodId)) {
      return NextResponse.json(
        { error: 'Pre-evaluation reminders can only be sent before the cycle start date.' },
        { status: 400 }
      )
    }

    let sent = 0
    const errors: string[] = []
    for (const prep of preps) {
      const result = await sendPreEvaluationLeadPrepNotification(prep.id, reminderType)
      if (result.success) {
        sent += 1
      } else {
        errors.push(prep.id)
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      failed: errors.length,
      errors,
    })
  } catch (error) {
    console.error('Failed to send pre-evaluation reminders:', error)
    return NextResponse.json(
      { error: 'Failed to send pre-evaluation reminders' },
      { status: 500 }
    )
  }
}

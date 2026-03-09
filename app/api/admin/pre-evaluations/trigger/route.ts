import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { sendPreEvaluationLeadPrepNotification } from '@/lib/email'
import { triggerPreEvaluationForPeriod, setPrepReminderSent } from '@/lib/pre-evaluation'

const triggerSchema = z.object({
  periodId: z.string().trim().min(1),
  resendExisting: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = triggerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const result = await triggerPreEvaluationForPeriod(
      parsed.data.periodId,
      'MANUAL',
      user.id
    )

    const notifyTargets = parsed.data.resendExisting
      ? result.preps
      : result.preps.filter((prep) => !prep.initialReminderSentAt)

    let notified = 0
    for (const prep of notifyTargets) {
      const emailResult = await sendPreEvaluationLeadPrepNotification(prep.id, 'INITIAL')
      if (emailResult.success) {
        notified += 1
        await setPrepReminderSent(prep.id, 'initial')
      }
    }

    return NextResponse.json({
      success: true,
      ...result,
      notified,
    })
  } catch (error) {
    console.error('Failed to trigger pre-evaluations:', error)
    return NextResponse.json(
      { error: 'Failed to trigger pre-evaluations' },
      { status: 500 }
    )
  }
}

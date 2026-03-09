import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { sendPreEvaluationLeadPrepNotification } from '@/lib/email'
import {
  findDuePreEvaluationPeriods,
  getPreEvaluationReminderCandidates,
  markOverduePreEvaluations,
  setPrepReminderSent,
  triggerPreEvaluationForPeriod,
} from '@/lib/pre-evaluation'

const automationSchema = z.object({
  dryRun: z.boolean().optional(),
})

function isAutomationAuthorized(request: NextRequest) {
  const secret = process.env.PRE_EVALUATION_CRON_SECRET || process.env.CRON_SECRET
  if (!secret) {
    return false
  }

  const authHeader = request.headers.get('authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return false
  }

  return authHeader.slice(7).trim() === secret
}

async function validateAutomationAuth(request: NextRequest) {
  const user = await getSession()
  return Boolean((user && isAdminRole(user.role)) || isAutomationAuthorized(request))
}

export async function POST(request: NextRequest) {
  try {
    const authorized = await validateAutomationAuth(request)
    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const parsed = automationSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const duePeriods = await findDuePreEvaluationPeriods()
    const sevenDayCandidates = await getPreEvaluationReminderCandidates(7)
    const oneDayCandidates = await getPreEvaluationReminderCandidates(1)

    if (parsed.data.dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        duePeriods: duePeriods.map((period) => ({ id: period.id, name: period.name })),
        sevenDayReminderCount: sevenDayCandidates.length,
        oneDayReminderCount: oneDayCandidates.length,
      })
    }

    let triggeredPeriods = 0
    let initialNotificationsSent = 0
    for (const period of duePeriods) {
      const result = await triggerPreEvaluationForPeriod(period.id, 'AUTO')
      triggeredPeriods += 1
      for (const prep of result.preps) {
        if (prep.initialReminderSentAt) continue
        const emailResult = await sendPreEvaluationLeadPrepNotification(prep.id, 'INITIAL')
        if (emailResult.success) {
          initialNotificationsSent += 1
          await setPrepReminderSent(prep.id, 'initial')
        }
      }
    }

    let sevenDaySent = 0
    for (const prep of sevenDayCandidates) {
      const emailResult = await sendPreEvaluationLeadPrepNotification(prep.id, 'SEVEN_DAY')
      if (emailResult.success) {
        sevenDaySent += 1
        await setPrepReminderSent(prep.id, '7-day')
      }
    }

    let oneDaySent = 0
    for (const prep of oneDayCandidates) {
      const emailResult = await sendPreEvaluationLeadPrepNotification(prep.id, 'ONE_DAY')
      if (emailResult.success) {
        oneDaySent += 1
        await setPrepReminderSent(prep.id, '1-day')
      }
    }

    const overdue = await markOverduePreEvaluations()

    return NextResponse.json({
      success: true,
      triggeredPeriods,
      initialNotificationsSent,
      sevenDaySent,
      oneDaySent,
      overdueMarked: overdue.count,
    })
  } catch (error) {
    console.error('Failed to run pre-evaluation automation:', error)
    return NextResponse.json(
      { error: 'Failed to run pre-evaluation automation' },
      { status: 500 }
    )
  }
}

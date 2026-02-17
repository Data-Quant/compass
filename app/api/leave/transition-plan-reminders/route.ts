import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { sendTransitionPlanReminderNotification } from '@/lib/email'
import { z } from 'zod'

const reminderBodySchema = z.object({
  daysBeforeStart: z.coerce.number().int().min(0).max(30).optional(),
  dryRun: z.boolean().optional(),
})

function isReminderJobAuthorized(request: NextRequest) {
  const secret = process.env.LEAVE_REMINDER_CRON_SECRET || process.env.CRON_SECRET
  if (!secret) {
    return false
  }

  const authHeader = request.headers.get('authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return false
  }

  const token = authHeader.slice(7).trim()
  return token.length > 0 && token === secret
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    const allowCron = isReminderJobAuthorized(request)
    const isAdmin = Boolean(user && isAdminRole(user.role))

    if (!isAdmin && !allowCron) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const parsed = reminderBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const daysBeforeStart = parsed.data.daysBeforeStart ?? 3
    const dryRun = parsed.data.dryRun ?? false

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const cutoff = new Date(today)
    cutoff.setDate(cutoff.getDate() + daysBeforeStart)

    const candidates = await prisma.leaveRequest.findMany({
      where: {
        status: { in: ['PENDING', 'LEAD_APPROVED', 'HR_APPROVED', 'APPROVED'] },
        startDate: { gte: today, lte: cutoff },
      },
      select: {
        id: true,
        transitionPlan: true,
      },
      orderBy: { startDate: 'asc' },
    })

    const missingPlanIds = candidates
      .filter((requestRow) => !(requestRow.transitionPlan || '').trim())
      .map((requestRow) => requestRow.id)

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        daysBeforeStart,
        eligible: missingPlanIds.length,
        requestIds: missingPlanIds,
      })
    }

    const results = {
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
    }

    for (const requestId of missingPlanIds) {
      const result = await sendTransitionPlanReminderNotification(requestId)
      if (result.success) {
        results.sent += 1
        continue
      }

      if ('error' in result && result.error) {
        results.failed += 1
        results.errors.push(`${requestId}: ${result.error}`)
      } else {
        results.skipped += 1
      }
    }

    return NextResponse.json({
      success: true,
      dryRun: false,
      daysBeforeStart,
      eligible: missingPlanIds.length,
      ...results,
    })
  } catch (error) {
    console.error('Failed to send transition plan reminders:', error)
    return NextResponse.json(
      { error: 'Failed to send transition plan reminders' },
      { status: 500 }
    )
  }
}

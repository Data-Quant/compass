import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import {
  sendTransitionPlanReminderNotification,
  sendTransitionPlanEscalation,
} from '@/lib/email'
import { classifyTransitionReminder } from '@/lib/leave-transition-plan'
import { z } from 'zod'

const reminderBodySchema = z.object({
  daysBeforeStart: z.coerce.number().int().min(0).max(30).optional(),
  dryRun: z.boolean().optional(),
})

const reminderQuerySchema = z.object({
  daysBeforeStart: z.coerce.number().int().min(0).max(30).optional(),
  dryRun: z.coerce.boolean().optional(),
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

// `daysBeforeStart` is the reminder window (default 5): leaves starting within this many
// days with an unsubmitted plan get a daily reminder. The hard deadline (3 days before
// start) and HR escalation are handled by classifyTransitionReminder.
async function runTransitionPlanReminders(reminderWindow = 5, dryRun = false) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() + reminderWindow)

  const candidates = await prisma.leaveRequest.findMany({
    where: {
      status: { in: ['PENDING', 'LEAD_APPROVED', 'HR_APPROVED', 'APPROVED'] },
      transitionPlanSubmittedAt: null,
      startDate: { gte: today, lte: cutoff },
    },
    select: { id: true, startDate: true },
    orderBy: { startDate: 'asc' },
  })

  // Which candidates have already had an HR escalation (so we don't email HR daily).
  const escalatedRows = await prisma.leaveAuditEvent.findMany({
    where: {
      eventType: 'TRANSITION_PLAN_ESCALATION',
      leaveRequestId: { in: candidates.map((c) => c.id) },
    },
    select: { leaveRequestId: true },
  })
  const escalatedIds = new Set(escalatedRows.map((e) => e.leaveRequestId))

  const decisions = candidates.map((c) => ({
    id: c.id,
    ...classifyTransitionReminder({
      startDate: new Date(c.startDate),
      submitted: false,
      alreadyEscalated: escalatedIds.has(c.id),
      now: today,
      reminderWindow,
    }),
  }))

  const toRemind = decisions.filter((d) => d.remind).map((d) => d.id)
  const toEscalate = decisions.filter((d) => d.escalate).map((d) => d.id)

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      reminderWindow,
      candidates: candidates.length,
      remind: toRemind.length,
      escalate: toEscalate.length,
      requestIds: { remind: toRemind, escalate: toEscalate },
    }
  }

  const results = { reminded: 0, escalated: 0, failed: 0, errors: [] as string[] }

  for (const requestId of toRemind) {
    const result = await sendTransitionPlanReminderNotification(requestId)
    if (result.success) results.reminded += 1
    else if ('message' in result && result.message) {
      // treat guard skips (already provided / not active) as no-ops, not failures
    }
  }

  for (const requestId of toEscalate) {
    const result = await sendTransitionPlanEscalation(requestId)
    if (result.success) results.escalated += 1
    else if ('message' in result && result.message) {
      results.failed += 1
      results.errors.push(`${requestId}: ${result.message}`)
    }
  }

  return { success: true, dryRun: false, reminderWindow, candidates: candidates.length, ...results }
}

async function validateReminderAuth(request: NextRequest) {
  const user = await getSession()
  const allowCron = isReminderJobAuthorized(request)
  const isAdmin = Boolean(user && isAdminRole(user.role))
  return isAdmin || allowCron
}

export async function GET(request: NextRequest) {
  try {
    const authorized = await validateReminderAuth(request)
    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const parsed = reminderQuerySchema.safeParse({
      daysBeforeStart: searchParams.get('daysBeforeStart') ?? undefined,
      dryRun: searchParams.get('dryRun') ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query params', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const result = await runTransitionPlanReminders(
      parsed.data.daysBeforeStart ?? 5,
      parsed.data.dryRun ?? false
    )
    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to send transition plan reminders:', error)
    return NextResponse.json(
      { error: 'Failed to send transition plan reminders' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorized = await validateReminderAuth(request)
    if (!authorized) {
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

    const result = await runTransitionPlanReminders(
      parsed.data.daysBeforeStart ?? 5,
      parsed.data.dryRun ?? false
    )
    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to send transition plan reminders:', error)
    return NextResponse.json(
      { error: 'Failed to send transition plan reminders' },
      { status: 500 }
    )
  }
}

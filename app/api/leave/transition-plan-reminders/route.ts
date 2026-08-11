import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { runTransitionPlanReminders } from '@/lib/leave-transition-plan-job'

/**
 * Daily job behind the transition-plan ladders. Runs from the Vercel cron in
 * vercel.json; admins can also trigger it by hand, which is how a dry run gets
 * checked against real data.
 *
 * The work itself lives in lib/leave-transition-plan-job.ts -- this only handles
 * authorisation and query parsing.
 *
 * `daysBeforeStart` tunes the *short-leave* reminder window only (default 5). The
 * deadline ladder for long leaves is fixed at seven days' notice and a two-day
 * response window, because those dates are what people are told in writing.
 */

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

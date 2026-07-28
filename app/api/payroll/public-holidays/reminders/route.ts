import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { canManagePayroll } from '@/lib/permissions'
import { sendPublicHolidayReminders } from '@/lib/email'

/**
 * Daily job that emails the teams observing a public holiday a few days out.
 *
 * Runs from the Vercel cron in vercel.json, alongside the leave and project
 * reminder jobs. Authorised either by the cron secret or by a signed-in payroll
 * manager, so HR can trigger it manually when needed.
 */

const querySchema = z.object({
  daysAhead: z.coerce.number().int().min(0).max(30).optional(),
})

function isCronAuthorized(request: NextRequest) {
  const secret = process.env.HOLIDAY_REMINDER_CRON_SECRET || process.env.CRON_SECRET
  if (!secret) return false

  const authHeader = request.headers.get('authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return false

  const token = authHeader.slice(7).trim()
  return token.length > 0 && token === secret
}

async function authorize(request: NextRequest) {
  if (isCronAuthorized(request)) return true

  const user = await getSession()
  return Boolean(user && canManagePayroll(user.role))
}

export async function GET(request: NextRequest) {
  try {
    if (!(await authorize(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const parsed = querySchema.safeParse({ daysAhead: searchParams.get('daysAhead') ?? undefined })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query', details: parsed.error.errors }, { status: 400 })
    }

    const result = await sendPublicHolidayReminders(parsed.data.daysAhead ?? 3)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to send public holiday reminders:', error)
    return NextResponse.json({ error: 'Failed to send public holiday reminders' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}

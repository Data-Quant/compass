import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { canManagePayroll } from '@/lib/permissions'
import { sendMonthlyPublicHolidayDigest } from '@/lib/email'

/**
 * Monthly job that emails each team its public holidays for the month ahead.
 *
 * Runs on the 1st from the Vercel cron in vercel.json. Authorised either by the
 * cron secret or by a signed-in payroll manager, so HR can trigger it manually.
 *
 * `month` (YYYY-MM) targets a specific month, which is how HR can preview or
 * resend one without waiting for the next cycle.
 */

const querySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM')
    .optional(),
  // Reports what would be sent without sending it, so HR can confirm against real
  // numbers before mailing the company.
  dryRun: z.coerce.boolean().optional(),
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
    const parsed = querySchema.safeParse({
      month: searchParams.get('month') ?? undefined,
      dryRun: searchParams.get('dryRun') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query', details: parsed.error.errors }, { status: 400 })
    }

    // Midday UTC so the reference date cannot slip into an adjacent month.
    const reference = parsed.data.month
      ? new Date(`${parsed.data.month}-01T12:00:00Z`)
      : new Date()

    if (Number.isNaN(reference.getTime())) {
      return NextResponse.json({ error: 'Invalid month' }, { status: 400 })
    }

    const result = await sendMonthlyPublicHolidayDigest(reference, {
      dryRun: parsed.data.dryRun ?? false,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to send public holiday digest:', error)
    return NextResponse.json({ error: 'Failed to send public holiday digest' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}

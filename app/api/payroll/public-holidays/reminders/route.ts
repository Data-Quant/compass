import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { canManagePayroll } from '@/lib/permissions'
import {
  sendMonthlyPublicHolidayDigest,
  sendNewPublicHolidayAnnouncement,
  sendPublicHolidayAnnouncementFor,
} from '@/lib/email'
import { sweepHolidayCalendarEvents } from '@/lib/holiday-calendar'

/**
 * Monthly job that reconciles holiday calendar invites and emails each team its
 * public holidays for the month ahead.
 *
 * Runs on the 1st from the Vercel cron in vercel.json. Authorised either by the
 * cron secret or by a signed-in payroll manager, so HR can trigger it manually.
 *
 * `month` (YYYY-MM) targets a specific month, which is how HR can preview or
 * resend one without waiting for the next cycle.
 *
 * The invite sweep runs first and covers a rolling twelve months, not just the month
 * being mailed: invites are created when HR saves a holiday, and this is what repairs
 * any that failed at the time. It is skipped when a specific `month` is requested,
 * since that mode exists to resend one digest rather than to reconcile calendars.
 */

const querySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM')
    .optional(),
  // Reports what would be sent without sending it, so HR can confirm against real
  // numbers before mailing the company.
  dryRun: z.coerce.boolean().optional(),
  // 'monthly' (the default, and what the cron runs) mails the whole month. 'new'
  // mails only holidays nobody has been told about yet, which is what HR presses
  // after adding one mid-month -- without it, adding a single holiday re-announces
  // every holiday in that month.
  scope: z.enum(['monthly', 'new']).optional(),
  // Announce one specific holiday, regardless of whether it has been announced
  // before. Takes precedence over `scope`.
  holidayId: z.string().trim().min(1).optional(),
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
      scope: searchParams.get('scope') ?? undefined,
      holidayId: searchParams.get('holidayId') ?? undefined,
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

    const dryRun = parsed.data.dryRun ?? false
    const scope = parsed.data.scope ?? 'monthly'

    // A calendar failure must not cost the email: it is the fallback for anyone whose
    // invite did not land, so it is the last thing that should be skipped when Google
    // is unavailable. Only the unscoped cron run reconciles; a targeted month or a
    // new-holiday send is about mail, not calendars.
    let calendarSweep: Awaited<ReturnType<typeof sweepHolidayCalendarEvents>> | null = null
    if (!parsed.data.month && !parsed.data.holidayId && scope === 'monthly') {
      try {
        calendarSweep = await sweepHolidayCalendarEvents({ dryRun })
      } catch (error) {
        console.error('Holiday calendar sweep failed:', error)
      }
    }

    const result = parsed.data.holidayId
      ? await sendPublicHolidayAnnouncementFor([parsed.data.holidayId], { dryRun })
      : scope === 'new'
        ? await sendNewPublicHolidayAnnouncement({ dryRun })
        : await sendMonthlyPublicHolidayDigest(reference, { dryRun })

    return NextResponse.json({ ...result, calendarSweep })
  } catch (error) {
    console.error('Failed to send public holiday digest:', error)
    return NextResponse.json({ error: 'Failed to send public holiday digest' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}

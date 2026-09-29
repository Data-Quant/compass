import { NextResponse, type NextRequest } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { sendMail } from '@/lib/email'
import { isWeeklyEnabled } from '@/lib/weekly/flag'
import { runWeeklyDailyJob } from '@/lib/weekly/service/daily-job'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// The daily job also scores the backlog (up to two minutes, after the release and question emails).
export const maxDuration = 300

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get('authorization'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isWeeklyEnabled()) return NextResponse.json({ skipped: 'Weekly evaluations are off' })
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin
    return NextResponse.json({ success: true, ...(await runWeeklyDailyJob(sendMail, appUrl)) })
  } catch (error) {
    console.error('[weekly] daily job failed', error)
    return NextResponse.json({ error: 'The weekly evaluations job failed' }, { status: 500 })
  }
}

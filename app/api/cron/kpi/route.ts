import { NextResponse, type NextRequest } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { sendMail } from '@/lib/email'
import { isKpiEnabled } from '@/lib/kpi/flag'
import { runDailyKpiJob } from '@/lib/kpi/service/daily-job'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isKpiEnabled()) return NextResponse.json({ skipped: 'The KPI module is off' })
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin
    return NextResponse.json({ success: true, ...(await runDailyKpiJob(sendMail, appUrl)) })
  } catch (error) {
    console.error('[kpi] daily job failed', error)
    return NextResponse.json({ error: 'The KPI daily job failed' }, { status: 500 })
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { isSecurityChecksEnabled } from '@/lib/security-checks/flag'
import { vercelBlobStore } from '@/lib/security-checks/service/blob-store'
import { runDailyJobs } from '@/lib/security-checks/service/jobs'
import { deliverPendingEmails } from '@/lib/security-checks/service/notifications'
import { runOverdueDigest, runSelfReviewReport } from '@/lib/security-checks/service/reports'

export const runtime = 'nodejs'
export const maxDuration = 300

type Context = { params: Promise<{ job: string }> }

/** Vercel Cron entry points: daily | weekly (overdue digest) | monthly (self-review report). */
export async function GET(request: NextRequest, context: Context) {
  if (!isCronAuthorized(request.headers.get('authorization'))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  if (!isSecurityChecksEnabled()) return NextResponse.json({ success: true, data: { skipped: 'module disabled' } })
  const { job } = await context.params
  const now = new Date()
  try {
    switch (job) {
      case 'daily':
        return NextResponse.json({ success: true, data: await runDailyJobs(now, vercelBlobStore()) })
      case 'weekly': {
        const digest = await runOverdueDigest(now)
        return NextResponse.json({ success: true, data: { digest, emails: await deliverPendingEmails() } })
      }
      case 'monthly': {
        const report = await runSelfReviewReport(now)
        return NextResponse.json({ success: true, data: { report, emails: await deliverPendingEmails() } })
      }
      default:
        return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }
  } catch (error) {
    console.error('[security-checks] cron failed', { job }, error)
    return NextResponse.json({ success: false, error: 'Job failed' }, { status: 500 })
  }
}

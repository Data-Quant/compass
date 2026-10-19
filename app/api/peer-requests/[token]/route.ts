import { NextResponse, type NextRequest } from 'next/server'
import { sendMail } from '@/lib/email'
import { checkRateLimit, RateLimitUnavailableError } from '@/lib/rate-limit'
import { assertSameOrigin } from '@/lib/security/same-origin'
import { isWeeklyEnabled } from '@/lib/weekly/flag'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { peerVoteSchema } from '@/lib/weekly/schemas'
import { WeeklyError } from '@/lib/weekly/service/errors'
import { peerRequestByToken, replyToPeerRequest, voteOnPeerRequest } from '@/lib/weekly/service/peer-requests'

export const dynamic = 'force-dynamic'

// No session: the unguessable token in the emailed link identifies the lead (who decides once) or the peer (who may reply).
type Params = { params: Promise<{ token: string }> }

async function limit(request: NextRequest): Promise<void> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  try {
    if (!(await checkRateLimit(`peer-request:${ip}`, 60)).allowed) throw new WeeklyError('Too many attempts. Try again later.', 429)
  } catch (error) {
    if (!(error instanceof RateLimitUnavailableError)) throw error
  }
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    if (!isWeeklyEnabled()) throw new WeeklyError('Not found', 404)
    await limit(request)
    return NextResponse.json(await peerRequestByToken((await params).token))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    if (!isWeeklyEnabled()) throw new WeeklyError('Not found', 404)
    assertSameOrigin(request.headers, request.url)
    await limit(request)
    const input = peerVoteSchema.parse(await request.json())
    const { token } = await params
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin
    if ('reply' in input) {
      await replyToPeerRequest(token, input.reply, new Date(), sendMail, appUrl)
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ success: true, ...(await voteOnPeerRequest(token, input.decision, input.note, new Date(), sendMail, appUrl)) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

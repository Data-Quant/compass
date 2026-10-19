import { NextResponse, type NextRequest } from 'next/server'
import { sendMail } from '@/lib/email'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { peerDecisionSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { adminPeerRequests, decidePeerRequest, resendPeerRequestLinks } from '@/lib/weekly/service/peer-requests'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await requireWeeklySession({ admin: true })
    return NextResponse.json(await adminPeerRequests(actorFromUser(user)))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

/** HR applies a request, declines it with a reason, asks the requester a question, or sends fresh links. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const input = peerDecisionSchema.parse(await request.json())
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin
    if ('action' in input) return NextResponse.json({ success: true, ...(await resendPeerRequestLinks(actorFromUser(user), input.requestId, new Date(), sendMail, appUrl)) })
    return NextResponse.json({ success: true, ...(await decidePeerRequest(actorFromUser(user), input.requestId, input.decision, input.note, new Date(), sendMail, appUrl)) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

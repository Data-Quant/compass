import { NextResponse, type NextRequest } from 'next/server'
import { sendMail } from '@/lib/email'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { selfReviewLeadSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { markSelfReviewRead, replyToSelfReview, teamSelfReviews } from '@/lib/weekly/service/self-review'

export const dynamic = 'force-dynamic'

/** The self-evaluations sent to this lead. */
export async function GET() {
  try {
    const user = await requireWeeklySession()
    return NextResponse.json(await teamSelfReviews(actorFromUser(user)))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

/** The lead marks one read, or replies with a short note the person sees. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession()
    await guardWeeklyMutation(request, user.id)
    const actor = actorFromUser(user)
    const input = selfReviewLeadSchema.parse(await request.json())
    const now = new Date()
    if (input.action === 'read') await markSelfReviewRead(actor, input.reviewId, now)
    else await replyToSelfReview(actor, input.reviewId, input.text, now, sendMail, process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin)
    return NextResponse.json({ success: true })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

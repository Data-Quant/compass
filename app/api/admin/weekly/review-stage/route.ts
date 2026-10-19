import { NextResponse, type NextRequest } from 'next/server'
import { sendMail } from '@/lib/email'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { reviewStageSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { WeeklyError } from '@/lib/weekly/service/errors'
import { openReviewStage, reviewStageView } from '@/lib/weekly/service/review-stage'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    const periodId = request.nextUrl.searchParams.get('periodId')
    if (!periodId) throw new WeeklyError('periodId is required')
    return NextResponse.json(await reviewStageView(actorFromUser(user), periodId))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

/** Opens the review stage: leads get their team-questions task and everyone is sent their lists. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const { periodId } = reviewStageSchema.parse(await request.json())
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin
    return NextResponse.json({ success: true, ...(await openReviewStage(actorFromUser(user), periodId, new Date(), sendMail, appUrl)) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

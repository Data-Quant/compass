import { NextResponse, type NextRequest } from 'next/server'
import { sendMail } from '@/lib/email'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { roundActionSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { openReviewStage } from '@/lib/weekly/service/review-stage'
import { openRound, roundView } from '@/lib/weekly/service/round'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ periodId: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireWeeklySession({ admin: true })
    return NextResponse.json(await roundView(actorFromUser(user), (await params).periodId, new Date()))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

/** The stage moves: open the review stage, then open the round. Closing and releasing use the close API. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const { action } = roundActionSchema.parse(await request.json())
    const actor = actorFromUser(user)
    const periodId = (await params).periodId
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin
    if (action === 'open-review') return NextResponse.json({ success: true, ...(await openReviewStage(actor, periodId, new Date(), sendMail, appUrl)) })
    await openRound(actor, periodId, new Date(), sendMail, appUrl)
    return NextResponse.json({ success: true })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

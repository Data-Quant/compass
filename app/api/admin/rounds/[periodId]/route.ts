import { NextResponse, type NextRequest } from 'next/server'
import { sendMail } from '@/lib/email'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { roundActionSchema, setupRoundSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { earlierQuarterView, isEarlierQuarter } from '@/lib/weekly/service/earlier-quarter'
import { openReviewStage } from '@/lib/weekly/service/review-stage'
import { deleteRound, openRound, roundView, setRoundLock, updateRound } from '@/lib/weekly/service/round'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ periodId: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireWeeklySession({ admin: true })
    const periodId = (await params).periodId
    // A quarter run on the earlier evaluations has no weekly round: it gets the short view to finish and close it.
    if (await isEarlierQuarter(periodId)) return NextResponse.json(await earlierQuarterView(actorFromUser(user), periodId))
    return NextResponse.json(await roundView(actorFromUser(user), periodId, new Date()))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

/** Changes the quarter and weekly schedule of a round that has not opened yet. */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    await updateRound(actorFromUser(user), (await params).periodId, setupRoundSchema.parse(await request.json()))
    return NextResponse.json({ success: true })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

/** Deletes a round that has not opened yet, with its quarter, so HR can set it up again. */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    await deleteRound(actorFromUser(user), (await params).periodId)
    return NextResponse.json({ success: true })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

/** The stage moves (open the review stage, then the round) and locking. Closing and releasing use the close API. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const { action } = roundActionSchema.parse(await request.json())
    const actor = actorFromUser(user)
    const periodId = (await params).periodId
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin
    if (action === 'open-review') return NextResponse.json({ success: true, ...(await openReviewStage(actor, periodId, new Date(), sendMail, appUrl)) })
    if (action === 'lock' || action === 'unlock') {
      await setRoundLock(actor, periodId, action === 'lock')
      return NextResponse.json({ success: true })
    }
    await openRound(actor, periodId, new Date(), sendMail, appUrl)
    return NextResponse.json({ success: true })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

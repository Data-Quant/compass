import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { reviewActionSchema, reviewFilterSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { WeeklyError } from '@/lib/weekly/service/errors'
import { decideAnswer, retryScoring, reviewQueue } from '@/lib/weekly/service/review-queue'

export async function GET(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    const cycleId = request.nextUrl.searchParams.get('cycleId')
    if (!cycleId) throw new WeeklyError('Choose a cycle')
    const filter = reviewFilterSchema.parse(request.nextUrl.searchParams.get('filter') ?? 'NEEDS_REVIEW')
    return NextResponse.json(await reviewQueue(actorFromUser(user), cycleId, filter))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

/** HR accepts the model's score, sets the score with a reason, or sends a failed answer back to the model. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const actor = actorFromUser(user)
    const input = reviewActionSchema.parse(await request.json())
    const now = new Date()
    if (input.action === 'retry') {
      await retryScoring(actor, input.responseId, now)
      return NextResponse.json({ success: true })
    }
    const decision = input.action === 'accept'
      ? { action: 'ACCEPT' as const, revision: input.revision, aiScoreId: input.aiScoreId, reason: input.reason }
      : { action: 'SET_SCORE' as const, revision: input.revision, score: input.score, reason: input.reason }
    return NextResponse.json({ success: true, ...(await decideAnswer(actor, input.responseId, decision, now)) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

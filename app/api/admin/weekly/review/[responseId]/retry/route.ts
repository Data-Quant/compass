import { after, NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { actorFromUser } from '@/lib/weekly/service/context'
import { retryScoring } from '@/lib/weekly/service/review-queue'
import { scoreResponseSoon } from '@/lib/weekly/service/scoring'

// Scoring runs after the response (after()) for up to INLINE_BUDGET_MS plus one model call.
export const maxDuration = 180

type Context = { params: Promise<{ responseId: string }> }

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const { responseId } = await context.params
    await retryScoring(actorFromUser(user), responseId, new Date())
    after(() => scoreResponseSoon(responseId))
    return NextResponse.json({ success: true })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

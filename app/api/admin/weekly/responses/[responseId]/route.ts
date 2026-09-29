import { after, NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { correctionSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { correctAnswer } from '@/lib/weekly/service/review-queue'
import { scoreResponseSoon } from '@/lib/weekly/service/scoring'

type Context = { params: Promise<{ responseId: string }> }

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const { responseId } = await context.params
    const result = await correctAnswer(actorFromUser(user), responseId, correctionSchema.parse(await request.json()), new Date())
    after(() => scoreResponseSoon(responseId))
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

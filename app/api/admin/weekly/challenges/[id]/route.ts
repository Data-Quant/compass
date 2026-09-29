import { NextResponse, type NextRequest } from 'next/server'
import { sendMail } from '@/lib/email'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { challengeActionSchema } from '@/lib/weekly/schemas'
import { adjustForChallenge, challengeDetail, resolveChallenge } from '@/lib/weekly/service/challenges'
import { actorFromUser } from '@/lib/weekly/service/context'

export const dynamic = 'force-dynamic'
type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, context: Context) {
  try {
    const user = await requireWeeklySession({ admin: true })
    const { id } = await context.params
    return NextResponse.json(await challengeDetail(actorFromUser(user), id))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const { id } = await context.params
    const actor = actorFromUser(user)
    const input = challengeActionSchema.parse(await request.json())
    const now = new Date()
    if (input.action === 'adjust') {
      return NextResponse.json({ success: true, ...(await adjustForChallenge(actor, id, { responseId: input.responseId, score: input.score, reason: input.reason }, now)) })
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin
    return NextResponse.json({ success: true, ...(await resolveChallenge(actor, id, { outcome: input.outcome, resolution: input.resolution }, now, sendMail, appUrl)) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

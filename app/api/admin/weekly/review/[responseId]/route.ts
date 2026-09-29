import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { decisionSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { decideAnswer } from '@/lib/weekly/service/decisions'

type Context = { params: Promise<{ responseId: string }> }

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const { responseId } = await context.params
    const result = await decideAnswer(actorFromUser(user), responseId, decisionSchema.parse(await request.json()), new Date())
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

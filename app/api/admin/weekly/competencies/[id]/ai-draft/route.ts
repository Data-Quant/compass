import { NextResponse, type NextRequest } from 'next/server'
import { resolveActiveModel } from '@/lib/weekly/service/ai-settings'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { draftTopicWithAi } from '@/lib/weekly/service/ai-drafting'
import { actorFromUser } from '@/lib/weekly/service/context'

export const runtime = 'nodejs'
// One model call (MODEL_TIMEOUT_MS) plus saving the draft.
export const maxDuration = 60
type Context = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const { id } = await context.params
    return NextResponse.json({ success: true, ...(await draftTopicWithAi(actorFromUser(user), id, await resolveActiveModel())) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

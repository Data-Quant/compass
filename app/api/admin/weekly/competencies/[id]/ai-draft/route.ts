import { NextResponse, type NextRequest } from 'next/server'
import { configuredModel } from '@/lib/weekly/ai/configured'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { draftTopicWithAi } from '@/lib/weekly/service/ai-drafting'
import { actorFromUser } from '@/lib/weekly/service/context'

export const runtime = 'nodejs'
type Context = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const { id } = await context.params
    return NextResponse.json({ success: true, ...(await draftTopicWithAi(actorFromUser(user), id, configuredModel())) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { aiModelSchema } from '@/lib/weekly/schemas'
import { aiSettingsView, setActiveModel } from '@/lib/weekly/service/ai-settings'
import { actorFromUser } from '@/lib/weekly/service/context'

export async function GET() {
  try {
    const user = await requireWeeklySession({ admin: true })
    return NextResponse.json(await aiSettingsView(actorFromUser(user)))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

/** HR picks the Fireworks model that scores answers; null goes back to the environment's model. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const { model } = aiModelSchema.parse(await request.json())
    await setActiveModel(actorFromUser(user), model, new Date())
    return NextResponse.json({ success: true })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { aiSettingsSchema } from '@/lib/weekly/schemas'
import { aiSettingsView, updateAiSettings } from '@/lib/weekly/service/ai-settings'
import { actorFromUser } from '@/lib/weekly/service/context'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await requireWeeklySession({ admin: true })
    return NextResponse.json(await aiSettingsView(actorFromUser(user)))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    await updateAiSettings(actorFromUser(user), aiSettingsSchema.parse(await request.json()), new Date())
    return NextResponse.json({ success: true })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

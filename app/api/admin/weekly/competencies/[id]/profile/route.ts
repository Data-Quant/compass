import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { profileDraftSchema } from '@/lib/weekly/schemas'
import { saveProfileDraft } from '@/lib/weekly/service/content'
import { actorFromUser } from '@/lib/weekly/service/context'

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const { id } = await context.params
    const profile = await saveProfileDraft(actorFromUser(user), id, profileDraftSchema.parse(await request.json()))
    return NextResponse.json({ success: true, profileId: profile.id, version: profile.version })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { promptUpdateSchema } from '@/lib/weekly/schemas'
import { updatePrompt } from '@/lib/weekly/service/content'
import { actorFromUser } from '@/lib/weekly/service/context'

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const { id } = await context.params
    await updatePrompt(actorFromUser(user), id, promptUpdateSchema.parse(await request.json()))
    return NextResponse.json({ success: true })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

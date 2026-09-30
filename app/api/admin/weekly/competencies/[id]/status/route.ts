import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { actorFromUser } from '@/lib/weekly/service/context'
import { removeTopic, restoreTopic } from '@/lib/weekly/service/question-bank'

const statusSchema = z.object({ action: z.enum(['remove', 'restore']) }).strict()

/** HR removes a topic from the weekly bank, or restores it. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const { id } = await context.params
    const { action } = statusSchema.parse(await request.json())
    if (action === 'remove') await removeTopic(actorFromUser(user), id)
    else await restoreTopic(actorFromUser(user), id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

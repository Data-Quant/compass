import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { topicCreateSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { createTopic } from '@/lib/weekly/service/question-bank'

/** HR adds a topic with its first question, for everyone or for chosen departments. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    return NextResponse.json({ success: true, ...(await createTopic(actorFromUser(user), topicCreateSchema.parse(await request.json()))) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

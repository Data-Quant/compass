import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { questionCreateSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { addQuestion } from '@/lib/weekly/service/question-bank'

/** HR adds a question, with its 8 statements, to a topic's rotation. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const { id } = await context.params
    return NextResponse.json({ success: true, ...(await addQuestion(actorFromUser(user), id, questionCreateSchema.parse(await request.json()))) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { actorFromUser } from '@/lib/weekly/service/context'
import { addQuestion } from '@/lib/weekly/service/question-bank'

const questionSchema = z.object({ text: z.string().trim().min(20, 'Write at least 20 characters').max(600) }).strict()

/** HR adds a question to a topic's rotation. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const { id } = await context.params
    return NextResponse.json({ success: true, ...(await addQuestion(actorFromUser(user), id, questionSchema.parse(await request.json()))) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

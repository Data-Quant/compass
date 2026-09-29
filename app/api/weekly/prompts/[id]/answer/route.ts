import { after, NextResponse, type NextRequest } from 'next/server'
import { DRAFT_LIMIT, guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { answerSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { resolveSubject, saveDraft, submitAnswer } from '@/lib/weekly/service/inbox'
import { scorePromptSoon } from '@/lib/weekly/service/scoring'

type Context = { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, context: Context) {
  try {
    const user = await requireWeeklySession()
    await guardWeeklyMutation(request, user.id, DRAFT_LIMIT)
    const actor = actorFromUser(user)
    const subject = await resolveSubject(actor, request.nextUrl.searchParams.get('as'))
    const { id } = await context.params
    const saved = await saveDraft(actor, subject, id, answerSchema.parse(await request.json()), new Date())
    return NextResponse.json({ success: true, ...saved })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await requireWeeklySession()
    await guardWeeklyMutation(request, user.id)
    const actor = actorFromUser(user)
    const subject = await resolveSubject(actor, request.nextUrl.searchParams.get('as'))
    const { id } = await context.params
    const result = await submitAnswer(actor, subject, id, answerSchema.parse(await request.json()), new Date())
    // Score now rather than waiting for the daily sweep; runs after the evaluator has their response.
    after(() => scorePromptSoon(id))
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

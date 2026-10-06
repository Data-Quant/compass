import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { surveyAdminSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { WeeklyError } from '@/lib/weekly/service/errors'
import { addSurveyQuestion, loadDefaultSurvey, removeSurveyQuestion, surveyBank, surveyResults } from '@/lib/weekly/service/survey'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    const periodId = request.nextUrl.searchParams.get('periodId')
    if (!periodId) throw new WeeklyError('periodId is required')
    const actor = actorFromUser(user)
    const [bank, results] = await Promise.all([surveyBank(actor, periodId), surveyResults(actor, periodId)])
    return NextResponse.json({ bank, results })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const actor = actorFromUser(user)
    const input = surveyAdminSchema.parse(await request.json())
    switch (input.action) {
      case 'load-default':
        await loadDefaultSurvey(actor, input.periodId)
        break
      case 'add':
        await addSurveyQuestion(actor, input.periodId, input.question)
        break
      case 'remove':
        await removeSurveyQuestion(actor, input.questionId)
        break
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { surveySubmitSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { mySurvey, submitSurvey } from '@/lib/weekly/service/survey'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await requireWeeklySession()
    return NextResponse.json(await mySurvey(actorFromUser(user), new Date()))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession()
    await guardWeeklyMutation(request, user.id)
    const input = surveySubmitSchema.parse(await request.json())
    return NextResponse.json({ success: true, ...(await submitSurvey(actorFromUser(user), input, new Date())) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

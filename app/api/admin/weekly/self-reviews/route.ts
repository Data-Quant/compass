import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { actorFromUser } from '@/lib/weekly/service/context'
import { WeeklyError } from '@/lib/weekly/service/errors'
import { selfReviewQuestionSchema } from '@/lib/weekly/schemas'
import { adminSelfReviews, updateSelfReviewQuestion } from '@/lib/weekly/service/self-review'

export const dynamic = 'force-dynamic'

/** Every self-evaluation of a round, filterable by month and department, with read status; and who has not sent one. */
export async function GET(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    const params = request.nextUrl.searchParams
    const periodId = params.get('periodId')
    if (!periodId) throw new WeeklyError('Choose a round')
    const month = Number(params.get('month'))
    const department = params.get('department')?.trim()
    return NextResponse.json(await adminSelfReviews(actorFromUser(user), periodId, {
      ...(month >= 1 && month <= 3 ? { month } : {}), ...(department ? { department } : {}),
    }))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

/** HR edits a month's question, until someone has answered it. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const { periodId, month, ...input } = selfReviewQuestionSchema.parse(await request.json())
    await updateSelfReviewQuestion(actorFromUser(user), periodId, month, input)
    return NextResponse.json({ success: true })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

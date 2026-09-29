import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { syncFromQuestionBank } from '@/lib/weekly/service/content'
import { actorFromUser } from '@/lib/weekly/service/context'

export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    return NextResponse.json({ success: true, ...(await syncFromQuestionBank(actorFromUser(user))) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

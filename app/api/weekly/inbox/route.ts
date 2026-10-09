import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { actorFromUser } from '@/lib/weekly/service/context'
import { inboxView, resolveSubject, submitWeek } from '@/lib/weekly/service/inbox'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await requireWeeklySession()
    const subject = await resolveSubject(actorFromUser(user), request.nextUrl.searchParams.get('as'))
    return NextResponse.json(await inboxView(subject.evaluatorId, new Date()))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

/** "Submit this week". */
export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession()
    await guardWeeklyMutation(request, user.id)
    const subject = await resolveSubject(actorFromUser(user), request.nextUrl.searchParams.get('as'))
    return NextResponse.json({ success: true, ...(await submitWeek(subject, new Date())) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

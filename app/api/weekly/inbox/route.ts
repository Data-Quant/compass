import { NextResponse, type NextRequest } from 'next/server'
import { requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { actorFromUser } from '@/lib/weekly/service/context'
import { inboxView, resolveSubject } from '@/lib/weekly/service/inbox'

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

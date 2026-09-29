import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { actorFromUser } from '@/lib/weekly/service/context'
import { markNotObserved, resolveSubject } from '@/lib/weekly/service/inbox'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireWeeklySession()
    await guardWeeklyMutation(request, user.id)
    const actor = actorFromUser(user)
    const subject = await resolveSubject(actor, request.nextUrl.searchParams.get('as'))
    const { id } = await context.params
    await markNotObserved(actor, subject, id, new Date())
    return NextResponse.json({ success: true })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

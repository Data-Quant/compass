import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { loadStandardBank } from '@/lib/weekly/service/content'
import { actorFromUser } from '@/lib/weekly/service/context'

/** HR loads the spec's standard multiple-choice bank; topics already loaded keep HR's edits. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    return NextResponse.json({ success: true, ...(await loadStandardBank(actorFromUser(user))) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

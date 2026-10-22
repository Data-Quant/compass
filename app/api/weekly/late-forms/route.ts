import { NextResponse } from 'next/server'
import { requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { actorFromUser } from '@/lib/weekly/service/context'
import { lateFormsView } from '@/lib/weekly/service/late-forms'

export const dynamic = 'force-dynamic'

/** What this person has left of the earlier quarter HR reopened to employees. */
export async function GET() {
  try {
    const user = await requireWeeklySession()
    return NextResponse.json(await lateFormsView(actorFromUser(user), new Date()))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

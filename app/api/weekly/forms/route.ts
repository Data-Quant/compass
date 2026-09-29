import { NextResponse } from 'next/server'
import { requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { actorFromUser } from '@/lib/weekly/service/context'
import { formsView } from '@/lib/weekly/service/forms'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await requireWeeklySession()
    return NextResponse.json(await formsView(actorFromUser(user), new Date()))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

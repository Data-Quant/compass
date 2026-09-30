import { NextResponse, type NextRequest } from 'next/server'
import { requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { actorFromUser } from '@/lib/weekly/service/context'
import { WeeklyError } from '@/lib/weekly/service/errors'
import { personScoreView } from '@/lib/weekly/service/person-score'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    const cycleId = request.nextUrl.searchParams.get('cycleId')
    const personId = request.nextUrl.searchParams.get('personId')
    if (!cycleId || !personId) throw new WeeklyError('cycleId and personId are required')
    return NextResponse.json(await personScoreView(actorFromUser(user), cycleId, personId))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { actorFromUser } from '@/lib/weekly/service/context'
import { dashboardView } from '@/lib/weekly/service/dashboard'
import { WeeklyError } from '@/lib/weekly/service/errors'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    const cycleId = request.nextUrl.searchParams.get('cycleId')
    if (!cycleId) throw new WeeklyError('cycleId is required')
    return NextResponse.json(await dashboardView(actorFromUser(user), cycleId, new Date()))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

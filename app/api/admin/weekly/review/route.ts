import { NextResponse, type NextRequest } from 'next/server'
import { requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { reviewFilterSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { WeeklyError } from '@/lib/weekly/service/errors'
import { reviewQueue } from '@/lib/weekly/service/review-queue'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    const cycleId = request.nextUrl.searchParams.get('cycleId')
    if (!cycleId) throw new WeeklyError('cycleId is required')
    const filter = reviewFilterSchema.parse(request.nextUrl.searchParams.get('filter') ?? 'NEEDS_REVIEW')
    return NextResponse.json(await reviewQueue(actorFromUser(user), { cycleId, filter }))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

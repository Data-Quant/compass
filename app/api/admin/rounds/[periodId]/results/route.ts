import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { roundResultsActionSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { markRoundReleased, releaseReport, roundResults } from '@/lib/weekly/service/round-results'

export const dynamic = 'force-dynamic'
// One report is generated and sent per call; generating can take a few seconds.
export const maxDuration = 60

type Params = { params: Promise<{ periodId: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireWeeklySession({ admin: true })
    return NextResponse.json(await roundResults(actorFromUser(user), (await params).periodId))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const input = roundResultsActionSchema.parse(await request.json())
    const actor = actorFromUser(user)
    const periodId = (await params).periodId
    if (input.action === 'release-report') return NextResponse.json({ success: true, ...(await releaseReport(actor, periodId, input.employeeId)) })
    return NextResponse.json({ success: true, ...(await markRoundReleased(actor, periodId, new Date())) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

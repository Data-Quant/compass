import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { setupRoundSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { roundsList, setupRound } from '@/lib/weekly/service/round'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await requireWeeklySession({ admin: true })
    return NextResponse.json({ rounds: await roundsList(actorFromUser(user)) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

/** Sets up a round: the quarter and its weekly cycle, in Draft. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const input = setupRoundSchema.parse(await request.json())
    return NextResponse.json({ success: true, ...(await setupRound(actorFromUser(user), input, new Date())) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

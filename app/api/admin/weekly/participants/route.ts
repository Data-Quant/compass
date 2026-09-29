import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { optInSchema, removeOptInSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { participantsView, removeOptIn, setOptIn } from '@/lib/weekly/service/cycles'
import { WeeklyError } from '@/lib/weekly/service/errors'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    const cycleId = request.nextUrl.searchParams.get('cycleId')
    if (!cycleId) throw new WeeklyError('cycleId is required')
    return NextResponse.json(await participantsView(actorFromUser(user), cycleId, new Date()))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    await setOptIn(actorFromUser(user), optInSchema.parse(await request.json()))
    return NextResponse.json({ success: true })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    await removeOptIn(actorFromUser(user), removeOptInSchema.parse(await request.json()))
    return NextResponse.json({ success: true })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

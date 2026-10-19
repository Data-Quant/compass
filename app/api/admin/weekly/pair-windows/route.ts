import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { pairWindowSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { WeeklyError } from '@/lib/weekly/service/errors'
import { pairWindowsView, setPairWindow } from '@/lib/weekly/service/pair-windows'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    const cycleId = request.nextUrl.searchParams.get('cycleId')
    if (!cycleId) throw new WeeklyError('cycleId is required')
    return NextResponse.json({ windows: await pairWindowsView(actorFromUser(user), cycleId) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const { cycleId, ...input } = pairWindowSchema.parse(await request.json())
    await setPairWindow(actorFromUser(user), cycleId, input)
    return NextResponse.json({ success: true })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

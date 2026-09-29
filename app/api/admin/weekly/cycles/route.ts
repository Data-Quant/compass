import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { createCycleSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { adminCycles, createCycle } from '@/lib/weekly/service/cycles'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await requireWeeklySession({ admin: true })
    return NextResponse.json(await adminCycles(actorFromUser(user), new Date()))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const cycle = await createCycle(actorFromUser(user), createCycleSchema.parse(await request.json()))
    return NextResponse.json({ success: true, cycleId: cycle.id })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

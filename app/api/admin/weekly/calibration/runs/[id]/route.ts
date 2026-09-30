import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { continueCalibrationRun } from '@/lib/weekly/service/calibration-runs'
import { calibrationRunDetail } from '@/lib/weekly/service/calibration-views'
import { actorFromUser } from '@/lib/weekly/service/context'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// "Continue" scores for up to CALIBRATION_BUDGET_MS plus one model call.
export const maxDuration = 120
type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, context: Context) {
  try {
    const user = await requireWeeklySession({ admin: true })
    const { id } = await context.params
    return NextResponse.json(await calibrationRunDetail(actorFromUser(user), id))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const { id } = await context.params
    return NextResponse.json({ success: true, ...(await continueCalibrationRun(actorFromUser(user), id)) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

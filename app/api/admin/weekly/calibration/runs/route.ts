import { after, NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { calibrationRunSchema } from '@/lib/weekly/schemas'
import { advanceCalibrationRunSoon, startCalibrationRun } from '@/lib/weekly/service/calibration-runs'
import { calibrationRunsView } from '@/lib/weekly/service/calibration-views'
import { actorFromUser } from '@/lib/weekly/service/context'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// The first part of the run is scored after the response (after()) for up to CALIBRATION_BUDGET_MS plus one model call.
export const maxDuration = 120

export async function GET() {
  try {
    const user = await requireWeeklySession({ admin: true })
    return NextResponse.json(await calibrationRunsView(actorFromUser(user)))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const started = await startCalibrationRun(actorFromUser(user), calibrationRunSchema.parse(await request.json()), new Date())
    after(() => advanceCalibrationRunSoon(started.runId))
    return NextResponse.json({ success: true, ...started })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

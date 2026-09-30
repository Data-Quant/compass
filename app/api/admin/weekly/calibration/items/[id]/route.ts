import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { calibrationItemUpdateSchema } from '@/lib/weekly/schemas'
import { updateCalibrationItem } from '@/lib/weekly/service/calibration-items'
import { actorFromUser } from '@/lib/weekly/service/context'

type Context = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const { id } = await context.params
    await updateCalibrationItem(actorFromUser(user), id, calibrationItemUpdateSchema.parse(await request.json()), new Date())
    return NextResponse.json({ success: true })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

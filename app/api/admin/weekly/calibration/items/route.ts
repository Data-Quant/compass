import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { calibrationItemSchema } from '@/lib/weekly/schemas'
import { addCalibrationItem, calibrationItemsView } from '@/lib/weekly/service/calibration-items'
import { actorFromUser } from '@/lib/weekly/service/context'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await requireWeeklySession({ admin: true })
    return NextResponse.json(await calibrationItemsView(actorFromUser(user)))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    return NextResponse.json({ success: true, ...(await addCalibrationItem(actorFromUser(user), calibrationItemSchema.parse(await request.json()), new Date())) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

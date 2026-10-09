import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { sendMail } from '@/lib/email'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { actorFromUser } from '@/lib/weekly/service/context'
import { dashboardView, sendHrReminders } from '@/lib/weekly/service/dashboard'
import { WeeklyError } from '@/lib/weekly/service/errors'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    const cycleId = request.nextUrl.searchParams.get('cycleId')
    if (!cycleId) throw new WeeklyError('cycleId is required')
    return NextResponse.json(await dashboardView(actorFromUser(user), cycleId, new Date()))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

const remindSchema = z.object({ action: z.literal('remind'), cycleId: z.string().min(1) }).strict()

/** HR sends everyone with open questions a reminder (at most once a day). */
export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const { cycleId } = remindSchema.parse(await request.json())
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin
    return NextResponse.json({ success: true, ...(await sendHrReminders(actorFromUser(user), cycleId, new Date(), sendMail, appUrl)) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { sendMail } from '@/lib/email'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { actorFromUser } from '@/lib/weekly/service/context'
import { sendMappingEmails } from '@/lib/weekly/service/peer-requests'
import { COMPASS_URL } from '@/lib/compass-url'

export const dynamic = 'force-dynamic'

/** Pre-evaluation: emails everyone their lead, team and peers for the quarter. Sent only when weekly emails are on. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const appUrl = COMPASS_URL
    return NextResponse.json({ success: true, ...(await sendMappingEmails(actorFromUser(user), new Date(), sendMail, appUrl)) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { sendMail } from '@/lib/email'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { closeActionSchema } from '@/lib/weekly/schemas'
import { closeCycle, closeView, publishResults, reopenCycle } from '@/lib/weekly/service/close'
import { actorFromUser } from '@/lib/weekly/service/context'
import { WeeklyError } from '@/lib/weekly/service/errors'
import { openForms } from '@/lib/weekly/service/forms'
import { announceRoundClosed } from '@/lib/weekly/service/round-notices'

export const dynamic = 'force-dynamic'
// Closing aggregates the whole quarter in one transaction.
export const maxDuration = 300

export async function GET(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    const cycleId = request.nextUrl.searchParams.get('cycleId')
    if (!cycleId) throw new WeeklyError('cycleId is required')
    return NextResponse.json(await closeView(actorFromUser(user), cycleId, new Date()))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const actor = actorFromUser(user)
    const input = closeActionSchema.parse(await request.json())
    const now = new Date()
    switch (input.action) {
      case 'close': {
        const closed = await closeCycle(actor, input.cycleId, { drops: input.drops, formsAcknowledged: input.formsAcknowledged }, now)
        // The round is closed whether or not the emails go out; a failed send is logged, not shown as a failed close.
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin
        await announceRoundClosed(input.cycleId, sendMail, appUrl).catch((error: unknown) => console.error('[weekly] round closed emails failed', { cycleId: input.cycleId, error }))
        return NextResponse.json({ success: true, ...closed })
      }
      case 'reopen':
        await reopenCycle(actor, input.cycleId, now)
        return NextResponse.json({ success: true })
      case 'publish':
        return NextResponse.json({ success: true, ...(await publishResults(actor, input.cycleId, now)) })
      case 'open-forms':
        await openForms(actor, input.cycleId, now)
        return NextResponse.json({ success: true })
    }
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

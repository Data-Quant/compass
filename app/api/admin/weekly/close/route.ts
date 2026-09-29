import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { closeActionSchema } from '@/lib/weekly/schemas'
import { closeCycle, closeView, publishResults, reopenCycle } from '@/lib/weekly/service/close'
import { actorFromUser } from '@/lib/weekly/service/context'
import { WeeklyError } from '@/lib/weekly/service/errors'
import { openForms } from '@/lib/weekly/service/forms'

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
      case 'close':
        return NextResponse.json({ success: true, ...(await closeCycle(actor, input.cycleId, { drops: input.drops, formsAcknowledged: input.formsAcknowledged }, now)) })
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

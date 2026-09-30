import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { testToolSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { sendMail } from '@/lib/email'
import { acceptDueNow, approveAllDrafts, askPairNow, fillSynthetic, pairsFor, releaseNextWeek, resetCycle, scoreNow, settleForClose } from '@/lib/weekly/service/test-tools'

export const runtime = 'nodejs'
// "Score now" runs for up to SCORE_NOW_BUDGET_MS plus one model call.
export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const actor = actorFromUser(user)
    const input = testToolSchema.parse(await request.json())
    const now = new Date()
    switch (input.action) {
      case 'release-next-week':
        return NextResponse.json({ success: true, ...(await releaseNextWeek(actor, input.cycleId, now)) })
      case 'fill-synthetic':
        return NextResponse.json({ success: true, ...(await fillSynthetic(actor, input.cycleId, input.evaluatorId, now)) })
      case 'approve-all-drafts':
        return NextResponse.json({ success: true, ...(await approveAllDrafts(actor)) })
      case 'reset':
        await resetCycle(actor, input.cycleId)
        return NextResponse.json({ success: true })
      case 'score-now':
        return NextResponse.json({ success: true, ...(await scoreNow(actor, input.cycleId, input.model)) })
      case 'accept-due-now':
        return NextResponse.json({ success: true, ...(await acceptDueNow(actor, input.cycleId, now)) })
      case 'settle-for-close':
        return NextResponse.json({ success: true, ...(await settleForClose(actor, input.cycleId, now)) })
      case 'pairs':
        return NextResponse.json({ success: true, pairs: await pairsFor(actor, input.cycleId, input.evaluatorId, now) })
      case 'ask-pair': {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin
        return NextResponse.json({ success: true, ...(await askPairNow(actor, input.cycleId, { evaluatorId: input.evaluatorId, evaluateeId: input.evaluateeId }, now, sendMail, appUrl)) })
      }
    }
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

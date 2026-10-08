import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { testToolSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { askPairNow, fillSynthetic, pairsFor, releaseNextWeek, releaseWeekFor, resetCycle } from '@/lib/weekly/service/test-tools'

export const runtime = 'nodejs'

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
      case 'reset':
        await resetCycle(actor, input.cycleId)
        return NextResponse.json({ success: true })
      case 'pairs':
        return NextResponse.json({ success: true, pairs: await pairsFor(actor, input.cycleId, input.evaluatorId, now) })
      case 'release-for':
        return NextResponse.json({ success: true, ...(await releaseWeekFor(actor, input.cycleId, input.evaluatorId, now)) })
      case 'ask-pair':
        return NextResponse.json({ success: true, ...(await askPairNow(actor, input.cycleId, { evaluatorId: input.evaluatorId, evaluateeId: input.evaluateeId }, now)) })
    }
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

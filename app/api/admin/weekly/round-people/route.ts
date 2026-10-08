import { NextResponse, type NextRequest } from 'next/server'
import { sendMail } from '@/lib/email'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { roundPeopleActionSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { acceptRoundWarning, changeRoundMapping } from '@/lib/weekly/service/round-people'

export const dynamic = 'force-dynamic'

/** HR on the round's People tab: accept a mapping warning, or change someone's lists for the round. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const input = roundPeopleActionSchema.parse(await request.json())
    const actor = actorFromUser(user)
    if (input.action === 'accept-warning') {
      await acceptRoundWarning(actor, input.cycleId, { userId: input.userId, warning: input.warning, reason: input.reason })
    } else {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin
      await changeRoundMapping(actor, input.cycleId, { userId: input.userId, otherId: input.otherId, relation: input.relation, action: input.change, reason: input.reason }, new Date(), sendMail, appUrl)
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

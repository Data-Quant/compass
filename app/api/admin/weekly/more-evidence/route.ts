import { NextResponse, type NextRequest } from 'next/server'
import { sendMail } from '@/lib/email'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { moreEvidenceSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { requestMoreEvidence } from '@/lib/weekly/service/more-evidence'

export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const input = moreEvidenceSchema.parse(await request.json())
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin
    const result = await requestMoreEvidence(actorFromUser(user), input.cycleId, { evaluateeId: input.evaluateeId, perspective: input.perspective }, new Date(), sendMail, appUrl)
    return NextResponse.json({ success: true, reopened: result.reopened, prompts: result.prompts, evaluators: result.evaluators })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

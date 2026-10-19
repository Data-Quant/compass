import { NextResponse, type NextRequest } from 'next/server'
import { sendMail } from '@/lib/email'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { selfReviewSubmitSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { mySelfReview, submitSelfReview } from '@/lib/weekly/service/self-review'

export const dynamic = 'force-dynamic'

const appUrlOf = (request: NextRequest) => process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin

export async function GET() {
  try {
    const user = await requireWeeklySession()
    return NextResponse.json(await mySelfReview(actorFromUser(user), new Date()))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

/** Sends this month's self-evaluation to the person's leads and HR. It cannot be changed afterwards. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession()
    await guardWeeklyMutation(request, user.id)
    const input = selfReviewSubmitSchema.parse(await request.json())
    return NextResponse.json({ success: true, ...(await submitSelfReview(actorFromUser(user), input, new Date(), sendMail, appUrlOf(request))) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

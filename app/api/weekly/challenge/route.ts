import { NextResponse, type NextRequest } from 'next/server'
import { sendMail } from '@/lib/email'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { challengeSchema } from '@/lib/weekly/schemas'
import { myChallenge, raiseChallenge } from '@/lib/weekly/service/challenges'
import { actorFromUser } from '@/lib/weekly/service/context'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await requireWeeklySession()
    return NextResponse.json(await myChallenge(actorFromUser(user), new Date()))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession()
    await guardWeeklyMutation(request, user.id)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin
    const challenge = await raiseChallenge(actorFromUser(user), challengeSchema.parse(await request.json()), new Date(), sendMail, appUrl)
    return NextResponse.json({ success: true, challenge })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

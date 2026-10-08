import { NextResponse, type NextRequest } from 'next/server'
import { sendMail } from '@/lib/email'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { cancelPeerRequestSchema, mappingActionSchema, peerRequestSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { answerPeerRequest, cancelPeerRequest, confirmMyLists, myMapping, requestPeerChange } from '@/lib/weekly/service/peer-requests'

export const dynamic = 'force-dynamic'

const appUrlOf = (request: NextRequest) => process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin

export async function GET() {
  try {
    const user = await requireWeeklySession()
    return NextResponse.json(await myMapping(actorFromUser(user), new Date()))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

/** Asks to change a list: a peer change goes to the requester's lead (the peer is told); a lead or team change to HR. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession()
    await guardWeeklyMutation(request, user.id)
    const input = peerRequestSchema.parse(await request.json())
    return NextResponse.json({ success: true, request: await requestPeerChange(actorFromUser(user), input, new Date(), sendMail, appUrlOf(request)) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

/** Says the lists look right, or answers HR's question on a request. */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireWeeklySession()
    await guardWeeklyMutation(request, user.id)
    const input = mappingActionSchema.parse(await request.json())
    const actor = actorFromUser(user)
    if (input.action === 'confirm') return NextResponse.json({ success: true, ...(await confirmMyLists(actor, new Date())) })
    return NextResponse.json({ success: true, request: await answerPeerRequest(actor, input.requestId, input.reason) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireWeeklySession()
    await guardWeeklyMutation(request, user.id)
    const { requestId } = cancelPeerRequestSchema.parse(await request.json())
    await cancelPeerRequest(actorFromUser(user), requestId)
    return NextResponse.json({ success: true })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

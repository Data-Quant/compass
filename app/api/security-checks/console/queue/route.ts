import type { NextRequest } from 'next/server'
import { errorResponse, okResponse, requireSecuritySession } from '@/lib/security-checks/http'
import { reviewQueue } from '@/lib/security-checks/service/review-queue'

export async function GET(request: NextRequest) {
  try {
    const { actor } = await requireSecuritySession()
    const campaignId = request.nextUrl.searchParams.get('campaignId') ?? undefined
    return okResponse(await reviewQueue(actor, { campaignId }, new Date()))
  } catch (error) {
    return errorResponse(error)
  }
}

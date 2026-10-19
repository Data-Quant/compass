import type { NextRequest } from 'next/server'
import { errorResponse, guardMutation, okResponse, requireSecuritySession, scheduleEmailDelivery } from '@/lib/security-checks/http'
import { bulkVerifySchema } from '@/lib/security-checks/schemas'
import { bulkVerify } from '@/lib/security-checks/service/review'

export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    const { actor } = await requireSecuritySession()
    await guardMutation(request, actor.id)
    const { taskIds } = bulkVerifySchema.parse(await request.json())
    const result = await bulkVerify(actor, taskIds, new Date())
    scheduleEmailDelivery()
    return okResponse(result)
  } catch (error) {
    return errorResponse(error)
  }
}

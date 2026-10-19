import type { NextRequest } from 'next/server'
import { errorResponse, guardMutation, okResponse, requireSecuritySession } from '@/lib/security-checks/http'
import { reasonOnlySchema } from '@/lib/security-checks/schemas'
import { closeCycleEarly } from '@/lib/security-checks/service/cycles'

type Context = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: Context) {
  try {
    const { actor } = await requireSecuritySession()
    await guardMutation(request, actor.id)
    const { id } = await context.params
    const { reason } = reasonOnlySchema.parse(await request.json())
    return okResponse(await closeCycleEarly(actor, id, reason, new Date()))
  } catch (error) {
    return errorResponse(error)
  }
}

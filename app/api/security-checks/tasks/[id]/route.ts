import type { NextRequest } from 'next/server'
import { errorResponse, guardMutation, okResponse, requireSecuritySession } from '@/lib/security-checks/http'
import { draftSchema } from '@/lib/security-checks/schemas'
import { getMyTask, saveDraft } from '@/lib/security-checks/service/tasks'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, context: Context) {
  try {
    const { actor } = await requireSecuritySession()
    const { id } = await context.params
    return okResponse(await getMyTask(actor, id, new Date()))
  } catch (error) {
    return errorResponse(error)
  }
}

/** Saves a draft (answers, declaration, N/A requests). */
export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { actor } = await requireSecuritySession()
    await guardMutation(request, actor.id)
    const { id } = await context.params
    const input = draftSchema.parse(await request.json())
    return okResponse(await saveDraft(actor, id, input, new Date()))
  } catch (error) {
    return errorResponse(error)
  }
}

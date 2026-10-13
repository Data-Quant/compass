import type { NextRequest } from 'next/server'
import { errorResponse, okResponse, requireSecuritySession } from '@/lib/security-checks/http'
import { getConsoleTask } from '@/lib/security-checks/service/review-queue'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, context: Context) {
  try {
    const { actor } = await requireSecuritySession()
    const { id } = await context.params
    return okResponse(await getConsoleTask(actor, id, new Date()))
  } catch (error) {
    return errorResponse(error)
  }
}

import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { errorResponse, guardMutation, okResponse, requireSecuritySession } from '@/lib/security-checks/http'
import { listNotifications, markRead } from '@/lib/security-checks/service/inbox'

const markReadSchema = z.union([
  z.object({ all: z.literal(true) }).strict(),
  z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(100) }).strict(),
])

export async function GET() {
  try {
    const { actor } = await requireSecuritySession()
    return okResponse(await listNotifications(actor.id))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { actor } = await requireSecuritySession()
    await guardMutation(request, actor.id)
    const input = markReadSchema.parse(await request.json())
    const updated = await markRead(actor.id, 'all' in input ? 'all' : input.ids, new Date())
    return okResponse({ updated })
  } catch (error) {
    return errorResponse(error)
  }
}

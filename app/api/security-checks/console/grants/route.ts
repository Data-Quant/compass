import type { NextRequest } from 'next/server'
import { errorResponse, guardMutation, okResponse, requireSecuritySession } from '@/lib/security-checks/http'
import { grantSchema } from '@/lib/security-checks/schemas'
import { grantConsoleAdmin, listConsoleGrants, revokeConsoleAdmin } from '@/lib/security-checks/service/grants'

export async function GET() {
  try {
    const { actor } = await requireSecuritySession()
    return okResponse(await listConsoleGrants(actor))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { actor } = await requireSecuritySession()
    await guardMutation(request, actor.id)
    await grantConsoleAdmin(actor, grantSchema.parse(await request.json()).userId)
    return okResponse(await listConsoleGrants(actor), 201)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { actor } = await requireSecuritySession()
    await guardMutation(request, actor.id)
    await revokeConsoleAdmin(actor, grantSchema.parse(await request.json()).userId)
    return okResponse(await listConsoleGrants(actor))
  } catch (error) {
    return errorResponse(error)
  }
}

import type { NextRequest } from 'next/server'
import { canManageCampaigns } from '@/lib/security-checks/access'
import { errorResponse, guardMutation, okResponse, requireSecuritySession } from '@/lib/security-checks/http'
import { settingsSchema } from '@/lib/security-checks/schemas'
import { requireCapability } from '@/lib/security-checks/service/actor'
import { getSettings, updateSettings } from '@/lib/security-checks/service/retention'

export async function GET() {
  try {
    const { actor } = await requireSecuritySession()
    requireCapability(canManageCampaigns(actor), 'Only Security Admins see retention settings')
    return okResponse(await getSettings())
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { actor } = await requireSecuritySession()
    await guardMutation(request, actor.id)
    return okResponse(await updateSettings(actor, settingsSchema.parse(await request.json())))
  } catch (error) {
    return errorResponse(error)
  }
}

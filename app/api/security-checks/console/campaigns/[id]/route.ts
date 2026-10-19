import type { NextRequest } from 'next/server'
import { errorResponse, guardMutation, okResponse, requireSecuritySession } from '@/lib/security-checks/http'
import { campaignUpdateSchema } from '@/lib/security-checks/schemas'
import { campaignDetail, deleteDraftCampaign, updateCampaign } from '@/lib/security-checks/service/campaigns'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, context: Context) {
  try {
    const { actor } = await requireSecuritySession()
    const { id } = await context.params
    return okResponse(await campaignDetail(actor, id))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { actor } = await requireSecuritySession()
    await guardMutation(request, actor.id)
    const { id } = await context.params
    await updateCampaign(actor, id, campaignUpdateSchema.parse(await request.json()))
    return okResponse(await campaignDetail(actor, id))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const { actor } = await requireSecuritySession()
    await guardMutation(request, actor.id)
    const { id } = await context.params
    await deleteDraftCampaign(actor, id)
    return okResponse({ deleted: true })
  } catch (error) {
    return errorResponse(error)
  }
}

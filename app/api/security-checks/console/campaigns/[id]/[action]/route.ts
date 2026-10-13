import type { NextRequest } from 'next/server'
import { errorResponse, guardMutation, okResponse, requireSecuritySession, scheduleEmailDelivery } from '@/lib/security-checks/http'
import { reasonOnlySchema } from '@/lib/security-checks/schemas'
import { activateCampaign, cloneCampaign, retireCampaign, uploadCampaignImage } from '@/lib/security-checks/service/campaigns'
import { campaignDashboard } from '@/lib/security-checks/service/dashboard'
import { SecurityChecksError } from '@/lib/security-checks/service/errors'

export const runtime = 'nodejs'
export const maxDuration = 120

type Context = { params: Promise<{ id: string; action: string }> }

export async function GET(_request: NextRequest, context: Context) {
  try {
    const { actor } = await requireSecuritySession()
    const { id, action } = await context.params
    if (action !== 'dashboard') throw new SecurityChecksError('Not found', 404)
    return okResponse(await campaignDashboard(actor, id, new Date()))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const { actor } = await requireSecuritySession()
    await guardMutation(request, actor.id)
    const { id, action } = await context.params
    const now = new Date()
    switch (action) {
      case 'activate': {
        const campaign = await activateCampaign(actor, id, now)
        scheduleEmailDelivery()
        return okResponse({ id: campaign.id, status: campaign.status })
      }
      case 'clone': {
        const clone = await cloneCampaign(actor, id)
        return okResponse({ id: clone.id }, 201)
      }
      case 'retire': {
        await retireCampaign(actor, id, reasonOnlySchema.parse(await request.json()).reason, now)
        return okResponse({ retired: true })
      }
      case 'images': {
        const form = await request.formData()
        const file = form.get('file')
        if (!(file instanceof File)) throw new SecurityChecksError('Choose an image to upload', 400)
        return okResponse(await uploadCampaignImage(actor, id, file), 201)
      }
      default:
        throw new SecurityChecksError('Not found', 404)
    }
  } catch (error) {
    return errorResponse(error)
  }
}

import type { NextRequest } from 'next/server'
import { errorResponse, guardMutation, okResponse, requireSecuritySession } from '@/lib/security-checks/http'
import { campaignFieldsSchema } from '@/lib/security-checks/schemas'
import { createCampaign, listCampaignRecords } from '@/lib/security-checks/service/campaigns'

export async function GET() {
  try {
    const { actor } = await requireSecuritySession()
    const campaigns = await listCampaignRecords(actor)
    return okResponse(
      campaigns.map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        control: campaign.control,
        status: campaign.status,
        version: campaign.version,
        predecessorId: campaign.predecessorId,
        frequency: campaign.frequency,
        subtaskMode: campaign.subtaskMode,
        evidenceRequired: campaign.evidenceRequired,
        firstOpenAt: campaign.firstOpenAt?.toISOString() ?? null,
        launchedAt: campaign.launchedAt?.toISOString() ?? null,
        cycleCount: campaign._count.cycles,
        latestCycle: campaign.cycles[0]
          ? { number: campaign.cycles[0].number, deadline: campaign.cycles[0].deadline.toISOString(), status: campaign.cycles[0].status }
          : null,
      })),
    )
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { actor } = await requireSecuritySession()
    await guardMutation(request, actor.id)
    const campaign = await createCampaign(actor, campaignFieldsSchema.parse(await request.json()))
    return okResponse({ id: campaign.id }, 201)
  } catch (error) {
    return errorResponse(error)
  }
}

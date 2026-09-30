import { after, NextResponse, type NextRequest } from 'next/server'
import { sendMail } from '@/lib/email'
import { guardMutation, requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { claimSchema } from '@/lib/kpi/schemas'
import { alertVerifiersOfClaim } from '@/lib/kpi/service/claim-alerts'
import { claimKpi } from '@/lib/kpi/service/claims'
import { loadActor } from '@/lib/kpi/service/context'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireKpiSession()
    await guardMutation(request, user.id)
    const { id } = await context.params
    const input = claimSchema.parse(await request.json())
    const kpi = await claimKpi(await loadActor(user), id, input)
    if (kpi.status === 'CLAIMED_DONE') {
      // Execution hears about a completed KPI straight away; a failed email never fails the claim.
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || request.nextUrl.origin
      after(() => alertVerifiersOfClaim(id, sendMail, appUrl).catch((error) => console.error('[kpi] claim alert failed', { kpiId: id, error })))
    }
    return NextResponse.json({ success: true, kpi })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

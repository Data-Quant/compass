import { NextResponse, type NextRequest } from 'next/server'
import { guardMutation, requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { claimSchema } from '@/lib/kpi/schemas'
import { claimKpi } from '@/lib/kpi/service/claims'
import { loadActor } from '@/lib/kpi/service/context'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireKpiSession()
    await guardMutation(request, user.id)
    const { id } = await context.params
    const input = claimSchema.parse(await request.json())
    const kpi = await claimKpi(await loadActor(user), id, input)
    return NextResponse.json({ success: true, kpi })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

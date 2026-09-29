import { NextResponse, type NextRequest } from 'next/server'
import { guardMutation, requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { updateKpiSchema } from '@/lib/kpi/schemas'
import { loadActor } from '@/lib/kpi/service/context'
import { kpiDetail } from '@/lib/kpi/service/detail'
import { updateKpi } from '@/lib/kpi/service/goals'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireKpiSession()
    const { id } = await context.params
    return NextResponse.json(await kpiDetail(await loadActor(user), id))
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireKpiSession()
    await guardMutation(request, user.id)
    const { id } = await context.params
    const input = updateKpiSchema.parse(await request.json())
    const kpi = await updateKpi(await loadActor(user), id, input)
    return NextResponse.json({ success: true, kpi })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

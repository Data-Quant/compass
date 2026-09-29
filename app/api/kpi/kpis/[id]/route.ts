import { NextResponse, type NextRequest } from 'next/server'
import { guardMutation, requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { updateKpiSchema } from '@/lib/kpi/schemas'
import { loadActor } from '@/lib/kpi/service/context'
import { updateKpi } from '@/lib/kpi/service/goals'

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

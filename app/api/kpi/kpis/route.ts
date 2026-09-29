import { NextResponse, type NextRequest } from 'next/server'
import { guardMutation, requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { createKpiSchema } from '@/lib/kpi/schemas'
import { loadActor } from '@/lib/kpi/service/context'
import { createKpi } from '@/lib/kpi/service/goals'

export async function POST(request: NextRequest) {
  try {
    const user = await requireKpiSession()
    await guardMutation(request, user.id)
    const input = createKpiSchema.parse(await request.json())
    const kpi = await createKpi(await loadActor(user), input)
    return NextResponse.json({ success: true, kpi: { id: kpi.id } })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

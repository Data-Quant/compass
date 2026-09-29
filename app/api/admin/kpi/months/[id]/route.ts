import { NextResponse, type NextRequest } from 'next/server'
import { guardMutation, requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { deadlineDatesSchema, toDeadlines } from '@/lib/kpi/schemas'
import { loadActor } from '@/lib/kpi/service/context'
import { updateMonthDeadlines } from '@/lib/kpi/service/months'

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireKpiSession({ admin: true })
    await guardMutation(request, user.id)
    const { id } = await context.params
    const dates = deadlineDatesSchema.parse(await request.json())
    await updateMonthDeadlines(await loadActor(user), id, toDeadlines(dates))
    return NextResponse.json({ success: true })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

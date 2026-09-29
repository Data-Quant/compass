import { NextResponse, type NextRequest } from 'next/server'
import { guardMutation, requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { updateGoalSchema } from '@/lib/kpi/schemas'
import { loadActor } from '@/lib/kpi/service/context'
import { updateGoal } from '@/lib/kpi/service/goals'

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireKpiSession()
    await guardMutation(request, user.id)
    const { id } = await context.params
    const input = updateGoalSchema.parse(await request.json())
    await updateGoal(await loadActor(user), id, input)
    return NextResponse.json({ success: true })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

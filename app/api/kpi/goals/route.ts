import { NextResponse, type NextRequest } from 'next/server'
import { guardMutation, requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { createGoalSchema } from '@/lib/kpi/schemas'
import { loadActor } from '@/lib/kpi/service/context'
import { createGoal } from '@/lib/kpi/service/goals'

export async function POST(request: NextRequest) {
  try {
    const user = await requireKpiSession()
    await guardMutation(request, user.id)
    const input = createGoalSchema.parse(await request.json())
    const goal = await createGoal(await loadActor(user), input)
    return NextResponse.json({ success: true, goal: { id: goal.id } })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

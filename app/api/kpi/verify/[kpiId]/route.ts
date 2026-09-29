import { NextResponse, type NextRequest } from 'next/server'
import { guardMutation, requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { decideSchema } from '@/lib/kpi/schemas'
import { loadActor } from '@/lib/kpi/service/context'
import { decideKpi } from '@/lib/kpi/service/verification'

export async function POST(request: NextRequest, context: { params: Promise<{ kpiId: string }> }) {
  try {
    const user = await requireKpiSession()
    await guardMutation(request, user.id)
    const { kpiId } = await context.params
    const input = decideSchema.parse(await request.json())
    const kpi = await decideKpi(await loadActor(user), kpiId, input)
    return NextResponse.json({ success: true, kpi })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

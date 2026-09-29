import { NextResponse, type NextRequest } from 'next/server'
import { guardMutation, requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { overrideSchema } from '@/lib/kpi/schemas'
import { loadActor } from '@/lib/kpi/service/context'
import { overrideResult } from '@/lib/kpi/service/finalization'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireKpiSession({ admin: true })
    await guardMutation(request, user.id)
    const { id } = await context.params
    const input = overrideSchema.parse(await request.json())
    const kpi = await overrideResult(await loadActor(user), id, input)
    return NextResponse.json({ success: true, kpi })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

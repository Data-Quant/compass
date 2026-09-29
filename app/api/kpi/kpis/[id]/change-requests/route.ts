import { NextResponse, type NextRequest } from 'next/server'
import { guardMutation, requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { changeRequestSchema } from '@/lib/kpi/schemas'
import { requestChange } from '@/lib/kpi/service/changes'
import { loadActor } from '@/lib/kpi/service/context'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireKpiSession()
    await guardMutation(request, user.id)
    const { id } = await context.params
    const input = changeRequestSchema.parse(await request.json())
    const created = await requestChange(await loadActor(user), id, input)
    return NextResponse.json({ success: true, request: { id: created.id, status: created.status } })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

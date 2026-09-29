import { NextResponse, type NextRequest } from 'next/server'
import { guardMutation, requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { decideChangeSchema } from '@/lib/kpi/schemas'
import { decideChange } from '@/lib/kpi/service/changes'
import { loadActor } from '@/lib/kpi/service/context'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireKpiSession()
    await guardMutation(request, user.id)
    const { id } = await context.params
    const input = decideChangeSchema.parse(await request.json())
    const result = await decideChange(await loadActor(user), id, input)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

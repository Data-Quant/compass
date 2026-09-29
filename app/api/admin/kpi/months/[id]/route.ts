import { NextResponse, type NextRequest } from 'next/server'
import { guardMutation, requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { parseMonthPatch } from '@/lib/kpi/schemas'
import { loadActor } from '@/lib/kpi/service/context'
import { markMonthFinal, reopenMonth } from '@/lib/kpi/service/finalization'
import { updateMonthDeadlines } from '@/lib/kpi/service/months'

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireKpiSession({ admin: true })
    await guardMutation(request, user.id)
    const { id } = await context.params
    const patch = parseMonthPatch(await request.json())
    const actor = await loadActor(user)
    if (patch.kind === 'deadlines') await updateMonthDeadlines(actor, id, patch.deadlines)
    else if (patch.input.action === 'reopen') await reopenMonth(actor, id, patch.input.reason)
    else await markMonthFinal(actor, id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

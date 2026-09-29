import { NextResponse, type NextRequest } from 'next/server'
import { parseMonthKey } from '@/lib/kpi/calendar'
import { guardMutation, requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { createMonthSchema, toDeadlines } from '@/lib/kpi/schemas'
import { listAdminMonths } from '@/lib/kpi/service/admin'
import { loadActor } from '@/lib/kpi/service/context'
import { KpiError } from '@/lib/kpi/service/errors'
import { createMonth } from '@/lib/kpi/service/months'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireKpiSession({ admin: true })
    return NextResponse.json({ months: await listAdminMonths() })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireKpiSession({ admin: true })
    await guardMutation(request, user.id)
    const input = createMonthSchema.parse(await request.json())
    const key = parseMonthKey(input.monthKey)
    if (!key) throw new KpiError('Use a YYYY-MM month')
    const month = await createMonth(await loadActor(user), key, input.deadlines ? toDeadlines(input.deadlines) : undefined)
    return NextResponse.json({ success: true, month: { id: month.id } })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

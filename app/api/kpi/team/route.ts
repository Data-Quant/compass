import { NextResponse, type NextRequest } from 'next/server'
import { currentMonthKey } from '@/lib/kpi/format'
import { requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { loadActor } from '@/lib/kpi/service/context'
import { teamView } from '@/lib/kpi/service/views'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await requireKpiSession()
    const params = request.nextUrl.searchParams
    return NextResponse.json(await teamView(await loadActor(user), params.get('month') ?? currentMonthKey(), params.get('setterId')))
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

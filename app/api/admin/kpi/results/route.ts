import { NextResponse, type NextRequest } from 'next/server'
import { currentMonthKey } from '@/lib/kpi/format'
import { requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { loadActor } from '@/lib/kpi/service/context'
import { monthResults } from '@/lib/kpi/service/results'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await requireKpiSession({ admin: true })
    return NextResponse.json(await monthResults(await loadActor(user), request.nextUrl.searchParams.get('month') ?? currentMonthKey()))
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

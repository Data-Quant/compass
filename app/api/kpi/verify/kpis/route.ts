import { NextResponse, type NextRequest } from 'next/server'
import { currentMonthKey } from '@/lib/kpi/format'
import { requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { loadActor } from '@/lib/kpi/service/context'
import { verifierView } from '@/lib/kpi/service/views'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await requireKpiSession()
    return NextResponse.json(await verifierView(await loadActor(user), request.nextUrl.searchParams.get('month') ?? currentMonthKey()))
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

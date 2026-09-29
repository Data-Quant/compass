import { NextResponse, type NextRequest } from 'next/server'
import { currentQuarterKey } from '@/lib/kpi/format'
import { requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { loadActor } from '@/lib/kpi/service/context'
import { myView } from '@/lib/kpi/service/views'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await requireKpiSession()
    const quarter = request.nextUrl.searchParams.get('quarter') ?? currentQuarterKey()
    return NextResponse.json(await myView(await loadActor(user), quarter))
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

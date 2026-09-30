import { NextResponse, type NextRequest } from 'next/server'
import { requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { loadActor } from '@/lib/kpi/service/context'
import { leadClaimHistory } from '@/lib/kpi/service/lead-history'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await requireKpiSession()
    const params = request.nextUrl.searchParams
    return NextResponse.json(await leadClaimHistory(await loadActor(user), { fromMonth: params.get('from'), toMonth: params.get('to') }))
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

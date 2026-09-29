import { NextResponse, type NextRequest } from 'next/server'
import { currentQuarterKey } from '@/lib/kpi/format'
import { requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { quarterOverview } from '@/lib/kpi/service/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    await requireKpiSession({ admin: true })
    return NextResponse.json(await quarterOverview(request.nextUrl.searchParams.get('quarter') ?? currentQuarterKey()))
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

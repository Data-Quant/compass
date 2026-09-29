import { NextResponse, type NextRequest } from 'next/server'
import { requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { loadActor } from '@/lib/kpi/service/context'
import { auditLog } from '@/lib/kpi/service/results'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await requireKpiSession({ admin: true })
    return NextResponse.json({ rows: await auditLog(await loadActor(user), request.nextUrl.searchParams.get('month')) })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

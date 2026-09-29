import { NextResponse } from 'next/server'
import { requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { changeRequestsFor } from '@/lib/kpi/service/changes'
import { loadActor } from '@/lib/kpi/service/context'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await requireKpiSession()
    return NextResponse.json({ requests: await changeRequestsFor(await loadActor(user)) })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

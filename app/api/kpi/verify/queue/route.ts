import { NextResponse } from 'next/server'
import { requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { loadActor } from '@/lib/kpi/service/context'
import { verificationQueue } from '@/lib/kpi/service/verification'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await requireKpiSession()
    return NextResponse.json(await verificationQueue(await loadActor(user)))
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { currentQuarterKey } from '@/lib/kpi/format'
import { requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { loadActor } from '@/lib/kpi/service/context'
import { exportQuarter } from '@/lib/kpi/service/results'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await requireKpiSession({ admin: true })
    const quarterKey = request.nextUrl.searchParams.get('quarter') ?? currentQuarterKey()
    // exportQuarter rejects anything but YYYY-Qn, so the key is safe in the file name.
    const buffer = await exportQuarter(await loadActor(user), quarterKey)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="kpis-${quarterKey}.xlsx"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

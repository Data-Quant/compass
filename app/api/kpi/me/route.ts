import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isKpiEnabled } from '@/lib/kpi/flag'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { loadActor, loadKpiContext } from '@/lib/kpi/service/context'
import { capabilitiesOf } from '@/lib/kpi/service/views'
import type { MeResponse } from '@/lib/kpi/view-types'

export const dynamic = 'force-dynamic'

// Not gated by requireKpiSession: the sidebar asks this even when the module is off.
export async function GET() {
  try {
    if (!isKpiEnabled()) return NextResponse.json({ enabled: false } satisfies MeResponse)
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const [actor, ctx] = await Promise.all([loadActor(user), loadKpiContext()])
    const body: MeResponse = { enabled: true, capabilities: capabilitiesOf(actor, ctx.scope), departmentKey: actor.departmentKey }
    return NextResponse.json(body)
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { areWeeklyTestToolsEnabled, isWeeklyEnabled } from '@/lib/weekly/flag'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { findRunningCycle } from '@/lib/weekly/service/cycles'
import { openPromptCount } from '@/lib/weekly/service/inbox'
import type { WeeklyMeResponse } from '@/lib/weekly/view-types'

export const dynamic = 'force-dynamic'

// Not gated by requireWeeklySession: the sidebar asks this even when the module is off.
export async function GET() {
  try {
    if (!isWeeklyEnabled()) return NextResponse.json({ enabled: false } satisfies WeeklyMeResponse)
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const cycle = await findRunningCycle()
    const body: WeeklyMeResponse = {
      enabled: true,
      cycleActive: Boolean(cycle),
      openCount: cycle ? await openPromptCount(cycle.id, user.id) : 0,
      isHr: user.role === 'HR',
      testTools: areWeeklyTestToolsEnabled(),
    }
    return NextResponse.json(body)
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

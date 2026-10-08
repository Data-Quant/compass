import { NextResponse } from 'next/server'
import { isWeeklyEnabled } from '@/lib/weekly/flag'
import { requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { actorFromUser } from '@/lib/weekly/service/context'
import { evaluationsCard } from '@/lib/weekly/service/dashboard-card'

export const dynamic = 'force-dynamic'

/** The dashboard's Evaluations card: one sentence on what to do now and by when. */
export async function GET() {
  try {
    if (!isWeeklyEnabled()) return NextResponse.json({ card: null })
    const user = await requireWeeklySession()
    return NextResponse.json({ card: await evaluationsCard(actorFromUser(user), new Date()) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

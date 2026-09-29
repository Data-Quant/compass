import { NextResponse } from 'next/server'
import { requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { contentView } from '@/lib/weekly/service/content'
import { actorFromUser } from '@/lib/weekly/service/context'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await requireWeeklySession({ admin: true })
    return NextResponse.json(await contentView(actorFromUser(user)))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

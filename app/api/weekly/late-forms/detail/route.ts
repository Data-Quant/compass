import { NextResponse, type NextRequest } from 'next/server'
import { requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { lateFormQuerySchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { lateFormDetail } from '@/lib/weekly/service/late-forms'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await requireWeeklySession()
    const query = lateFormQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
    return NextResponse.json(await lateFormDetail(actorFromUser(user), query, new Date()))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

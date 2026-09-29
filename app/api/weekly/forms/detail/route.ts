import { NextResponse, type NextRequest } from 'next/server'
import { requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { formQuerySchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { formDetail } from '@/lib/weekly/service/forms'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await requireWeeklySession()
    const query = formQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
    return NextResponse.json(await formDetail(actorFromUser(user), query, new Date()))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

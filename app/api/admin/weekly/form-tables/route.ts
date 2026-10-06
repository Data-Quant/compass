import { NextResponse, type NextRequest } from 'next/server'
import { DRAFT_LIMIT, guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { formTableKindSchema, formTableRowSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { formTables, saveTableRow } from '@/lib/weekly/service/form-tables'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    const kind = formTableKindSchema.parse(request.nextUrl.searchParams.get('kind') ?? 'HR')
    return NextResponse.json(await formTables(actorFromUser(user), kind, new Date()))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

/** Saves one row as HR scores it (a draft), or submits it. Cells save as HR types, so this uses the draft rate limit. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id, DRAFT_LIMIT)
    const input = formTableRowSchema.parse(await request.json())
    return NextResponse.json({ success: true, ...(await saveTableRow(actorFromUser(user), input, new Date())) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

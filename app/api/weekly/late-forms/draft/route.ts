import { NextResponse, type NextRequest } from 'next/server'
import { DRAFT_LIMIT, guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { lateFormInputSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { saveLateFormDraft } from '@/lib/weekly/service/late-forms'

export async function PUT(request: NextRequest) {
  try {
    const user = await requireWeeklySession()
    await guardWeeklyMutation(request, user.id, DRAFT_LIMIT)
    return NextResponse.json({ success: true, ...(await saveLateFormDraft(actorFromUser(user), lateFormInputSchema.parse(await request.json()), new Date())) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { DRAFT_LIMIT, guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { formInputSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { saveFormDraft } from '@/lib/weekly/service/form-submit'

export async function PUT(request: NextRequest) {
  try {
    const user = await requireWeeklySession()
    await guardWeeklyMutation(request, user.id, DRAFT_LIMIT)
    return NextResponse.json({ success: true, ...(await saveFormDraft(actorFromUser(user), formInputSchema.parse(await request.json()), new Date())) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

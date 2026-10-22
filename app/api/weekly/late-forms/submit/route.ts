import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { lateFormInputSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { submitLateForm } from '@/lib/weekly/service/late-forms'

export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession()
    await guardWeeklyMutation(request, user.id)
    return NextResponse.json({ success: true, ...(await submitLateForm(actorFromUser(user), lateFormInputSchema.parse(await request.json()), new Date())) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

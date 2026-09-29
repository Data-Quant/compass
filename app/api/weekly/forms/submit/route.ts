import { NextResponse, type NextRequest } from 'next/server'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { formInputSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { submitForm } from '@/lib/weekly/service/form-submit'

export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession()
    await guardWeeklyMutation(request, user.id)
    return NextResponse.json({ success: true, ...(await submitForm(actorFromUser(user), formInputSchema.parse(await request.json()), new Date())) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

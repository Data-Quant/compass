import { NextResponse, type NextRequest } from 'next/server'
import { guardMutation, requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { commentSchema } from '@/lib/kpi/schemas'
import { addKpiComment, listKpiComments } from '@/lib/kpi/service/comments'
import { loadActor } from '@/lib/kpi/service/context'

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireKpiSession()
    const { id } = await context.params
    return NextResponse.json({ success: true, comments: await listKpiComments(await loadActor(user), id) })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireKpiSession()
    await guardMutation(request, user.id)
    const { id } = await context.params
    const input = commentSchema.parse(await request.json())
    return NextResponse.json({ success: true, comments: await addKpiComment(await loadActor(user), id, input) })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

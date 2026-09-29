import { NextResponse, type NextRequest } from 'next/server'
import { guardMutation, requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { removeSetterSchema, setterAssignmentSchema } from '@/lib/kpi/schemas'
import { addSetterAssignment, removeSetterAssignment, settersOverview } from '@/lib/kpi/service/admin'
import { loadActor } from '@/lib/kpi/service/context'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireKpiSession({ admin: true })
    return NextResponse.json(await settersOverview())
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireKpiSession({ admin: true })
    await guardMutation(request, user.id)
    await addSetterAssignment(await loadActor(user), setterAssignmentSchema.parse(await request.json()))
    return NextResponse.json({ success: true })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireKpiSession({ admin: true })
    await guardMutation(request, user.id)
    const input = removeSetterSchema.parse(await request.json())
    await removeSetterAssignment(await loadActor(user), input.id, input.reason)
    return NextResponse.json({ success: true })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

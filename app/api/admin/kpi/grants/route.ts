import { NextResponse, type NextRequest } from 'next/server'
import { guardMutation, requireKpiSession } from '@/lib/kpi/http'
import { kpiErrorResponse } from '@/lib/kpi/http-errors'
import { grantSchema, removeGrantSchema } from '@/lib/kpi/schemas'
import { addGrant, grantsOverview, removeGrant } from '@/lib/kpi/service/admin'
import { loadActor } from '@/lib/kpi/service/context'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireKpiSession({ admin: true })
    return NextResponse.json(await grantsOverview())
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireKpiSession({ admin: true })
    await guardMutation(request, user.id)
    await addGrant(await loadActor(user), grantSchema.parse(await request.json()))
    return NextResponse.json({ success: true })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireKpiSession({ admin: true })
    await guardMutation(request, user.id)
    await removeGrant(await loadActor(user), removeGrantSchema.parse(await request.json()).id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return kpiErrorResponse(error)
  }
}

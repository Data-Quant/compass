import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getProjectAuthorization, isProjectRecordId, projectAuthorizationFailure } from '@/lib/project-access'
import { assertSameOrigin, SameOriginError } from '@/lib/security/same-origin'
import { formatSprintDate, getSprintStatus, sprintNeedsReview, validateSprintInput } from '@/lib/project-sprints'

type RouteParams = { params: Promise<{ id: string; sprintId: string }> }

async function authorizeSprintWrite(request: NextRequest, params: RouteParams['params']) {
  assertSameOrigin(request.headers, request.url)
  const user = await getSession()
  if (!user) return { failure: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { id: projectId, sprintId } = await params
  const authorization = await getProjectAuthorization(projectId, user)
  const authorizationFailure = projectAuthorizationFailure(authorization, 'manage')
  if (authorizationFailure) {
    return { failure: NextResponse.json({ error: authorizationFailure.error }, { status: authorizationFailure.status }) }
  }
  const sprint = isProjectRecordId(sprintId)
    ? await prisma.sprint.findFirst({ where: { id: sprintId, projectId } })
    : null
  if (!sprint) return { failure: NextResponse.json({ error: 'Sprint not found' }, { status: 404 }) }
  return { sprint }
}

// PATCH - Edit name and dates. Missing fields keep their current values.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { sprint, failure } = await authorizeSprintWrite(request, params)
    if (failure) return failure
    if (sprint.completedAt) {
      return NextResponse.json({ error: 'A completed sprint cannot be edited' }, { status: 409 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid sprint payload' }, { status: 400 })
    const parsed = validateSprintInput({
      name: sprint.name,
      startDate: formatSprintDate(sprint.startDate),
      endDate: formatSprintDate(sprint.endDate),
      ...body,
    })
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const updated = await prisma.sprint.update({ where: { id: sprint.id }, data: parsed.value })
    return NextResponse.json({
      success: true,
      sprint: {
        ...updated,
        startDate: formatSprintDate(updated.startDate),
        endDate: formatSprintDate(updated.endDate),
        status: getSprintStatus(updated),
        needsReview: sprintNeedsReview(updated),
      },
    })
  } catch (error) {
    if (error instanceof SameOriginError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    console.error('Failed to update sprint:', error)
    return NextResponse.json({ error: 'Failed to update sprint' }, { status: 500 })
  }
}

// DELETE - Tasks in the sprint become sprintless through the SetNull foreign key.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { sprint, failure } = await authorizeSprintWrite(request, params)
    if (failure) return failure
    if (sprint.completedAt) {
      return NextResponse.json({ error: 'A completed sprint is kept as history and cannot be deleted' }, { status: 409 })
    }
    await prisma.sprint.delete({ where: { id: sprint.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof SameOriginError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    console.error('Failed to delete sprint:', error)
    return NextResponse.json({ error: 'Failed to delete sprint' }, { status: 500 })
  }
}

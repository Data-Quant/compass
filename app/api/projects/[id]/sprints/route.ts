import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getProjectAuthorization, projectAuthorizationFailure } from '@/lib/project-access'
import { assertSameOrigin, SameOriginError } from '@/lib/security/same-origin'
import {
  formatSprintDate,
  getSprintStatus,
  pickDefaultSprint,
  sprintNeedsReview,
  validateSprintInput,
} from '@/lib/project-sprints'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id: projectId } = await params
    const authorization = await getProjectAuthorization(projectId, user)
    const authorizationFailure = projectAuthorizationFailure(authorization)
    if (authorizationFailure) {
      return NextResponse.json({ error: authorizationFailure.error }, { status: authorizationFailure.status })
    }

    const [sprints, counts] = await Promise.all([
      prisma.sprint.findMany({
        where: { projectId },
        orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, startDate: true, endDate: true, completedAt: true, createdById: true },
      }),
      // Backlog is excluded from sprint progress, like everywhere else.
      prisma.task.groupBy({
        by: ['sprintId', 'status'],
        where: {
          projectId,
          sprintId: { not: null },
          OR: [{ sectionId: null }, { section: { isBacklog: false } }],
        },
        _count: { _all: true },
      }),
    ])

    const now = new Date()
    const defaultSprint = pickDefaultSprint(sprints, now)
    return NextResponse.json({
      sprints: sprints.map((sprint) => {
        const rows = counts.filter((row) => row.sprintId === sprint.id)
        return {
          ...sprint,
          startDate: formatSprintDate(sprint.startDate),
          endDate: formatSprintDate(sprint.endDate),
          status: getSprintStatus(sprint, now),
          needsReview: sprintNeedsReview(sprint, now),
          taskCount: rows.reduce((sum, row) => sum + row._count._all, 0),
          doneCount: rows.filter((row) => row.status === 'DONE').reduce((sum, row) => sum + row._count._all, 0),
        }
      }),
      defaultSprintId: defaultSprint?.id || null,
    })
  } catch (error) {
    console.error('Failed to fetch sprints:', error)
    return NextResponse.json({ error: 'Failed to fetch sprints' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request.headers, request.url)
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id: projectId } = await params
    const authorization = await getProjectAuthorization(projectId, user)
    const authorizationFailure = projectAuthorizationFailure(authorization, 'manage')
    if (authorizationFailure) {
      return NextResponse.json({ error: authorizationFailure.error }, { status: authorizationFailure.status })
    }

    const parsed = validateSprintInput(await request.json().catch(() => null))
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const sprint = await prisma.sprint.create({
      data: { projectId, createdById: user.id, ...parsed.value },
    })

    return NextResponse.json({
      success: true,
      sprint: {
        ...sprint,
        startDate: formatSprintDate(sprint.startDate),
        endDate: formatSprintDate(sprint.endDate),
        status: getSprintStatus(sprint),
        needsReview: sprintNeedsReview(sprint),
        taskCount: 0,
        doneCount: 0,
      },
    })
  } catch (error) {
    if (error instanceof SameOriginError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    console.error('Failed to create sprint:', error)
    return NextResponse.json({ error: 'Failed to create sprint' }, { status: 500 })
  }
}

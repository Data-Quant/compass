import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  accessibleProjectsWhere,
  getProjectAuthorization,
  isProjectRecordId,
  projectAuthorizationFailure,
} from '@/lib/project-access'
import { buildPersonAnalytics, buildProjectAnalytics, resolveAnalyticsRange } from '@/lib/project-analytics'
import {
  ANALYTICS_TASK_SELECT,
  NOT_BACKLOG_TASK_WHERE,
  projectParticipants,
  toAnalyticsTask,
} from '@/lib/project-analytics-data'

// GET - Project analytics, plus one participant's People view with ?userId=
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!isProjectRecordId(id)) return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })

    const authorization = await getProjectAuthorization(id, user)
    const authorizationFailure = projectAuthorizationFailure(authorization, 'access')
    if (authorizationFailure) {
      return NextResponse.json({ error: authorizationFailure.error }, { status: authorizationFailure.status })
    }

    const search = request.nextUrl.searchParams
    const now = new Date()
    const range = resolveAnalyticsRange({
      range: search.get('range') ?? undefined,
      from: search.get('from') ?? undefined,
      to: search.get('to') ?? undefined,
    }, now)
    if ('error' in range) return NextResponse.json({ error: range.error }, { status: 400 })

    const userId = search.get('userId')
    if (userId !== null && !isProjectRecordId(userId)) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 })
    }

    const [project, tasks] = await Promise.all([
      prisma.project.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          color: true,
          owner: { select: { id: true, name: true } },
          members: { select: { user: { select: { id: true, name: true } } } },
          sections: { select: { id: true, name: true, isBacklog: true, isDone: true, orderIndex: true } },
        },
      }),
      prisma.task.findMany({ where: { AND: [{ projectId: id }, NOT_BACKLOG_TASK_WHERE] }, select: ANALYTICS_TASK_SELECT }),
    ])
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const members = projectParticipants(project)
    let person = null
    if (userId !== null) {
      if (!members.some((member) => member.id === userId)) {
        return NextResponse.json({ error: 'User is not part of this project' }, { status: 400 })
      }
      person = await loadPersonAnalytics(user, userId, now)
    }

    const response = NextResponse.json({
      project: { id: project.id, name: project.name, color: project.color },
      range,
      analytics: buildProjectAnalytics(tasks.map(toAnalyticsTask), project.sections, members, range, now),
      person,
    })
    response.headers.set('Cache-Control', 'private, max-age=60')
    return response
  } catch (error) {
    console.error('Failed to fetch project analytics:', error)
    return NextResponse.json({ error: 'Failed to fetch project analytics' }, { status: 500 })
  }
}

async function loadPersonAnalytics(viewer: { id: string; role: string | null }, userId: string, now: Date) {
  // Only projects the viewer can open are counted; nothing from other projects leaks.
  const accessibleProjects = await prisma.project.findMany({
    where: accessibleProjectsWhere(viewer),
    select: { id: true, name: true, color: true },
  })
  const accessible = new Map(accessibleProjects.map((project) => [project.id, project]))
  const tasks = await prisma.task.findMany({
    where: {
      AND: [
        { projectId: { in: [...accessible.keys()] } },
        NOT_BACKLOG_TASK_WHERE,
        { OR: [{ assigneeId: userId }, { assistants: { some: { userId } } }] },
        // Heatmap window (53 weeks) plus everything still open.
        { OR: [{ completedAt: { gte: new Date(now.getTime() - 53 * 7 * 86_400_000) } }, { status: { not: 'DONE' } }] },
      ],
    },
    select: { ...ANALYTICS_TASK_SELECT, title: true },
  })

  const analytics = buildPersonAnalytics(tasks.map(toAnalyticsTask), userId, now)

  return {
    userId,
    ...analytics,
    byProject: analytics.byProject.flatMap((entry) => {
      const project = accessible.get(entry.projectId)
      return project ? [{ projectId: project.id, name: project.name, color: project.color, count: entry.count }] : []
    }),
    recent: analytics.recent.map((task) => ({ ...task, projectName: accessible.get(task.projectId)?.name ?? '' })),
  }
}

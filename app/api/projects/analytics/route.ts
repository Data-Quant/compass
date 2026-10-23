import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { accessibleProjectsWhere, filterManageableProjects } from '@/lib/project-access'
import { buildWorkspaceAnalytics, resolveAnalyticsRange } from '@/lib/project-analytics'
import { ANALYTICS_TASK_SELECT, NOT_BACKLOG_TASK_WHERE, projectParticipants, toAnalyticsTask } from '@/lib/project-analytics-data'

// GET - Workspace analytics across the projects the viewer manages
export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const search = request.nextUrl.searchParams
    const now = new Date()
    const range = resolveAnalyticsRange({
      range: search.get('range') ?? undefined,
      from: search.get('from') ?? undefined,
      to: search.get('to') ?? undefined,
    }, now)
    if ('error' in range) return NextResponse.json({ error: range.error }, { status: 400 })

    const select = {
      id: true,
      name: true,
      color: true,
      status: true,
      owner: { select: { id: true, name: true } },
      members: { select: { user: { select: { id: true, name: true } } } },
      tasks: { where: NOT_BACKLOG_TASK_WHERE, select: ANALYTICS_TASK_SELECT },
    }
    let projects
    if (user.role === 'HR') {
      projects = await prisma.project.findMany({ where: accessibleProjectsWhere(user), select })
    } else {
      const candidates = await prisma.project.findMany({
        where: accessibleProjectsWhere(user),
        select: { id: true, ownerId: true, members: { select: { userId: true, role: true } } },
      })
      const managedIds = filterManageableProjects(user, candidates).map((project) => project.id)
      projects = await prisma.project.findMany({ where: { id: { in: managedIds } }, select })
    }
    if (projects.length === 0) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const members = new Map(projects.flatMap(projectParticipants).map((member) => [member.id, member]))
    const response = NextResponse.json({
      range,
      projects: projects.map((project) => ({ id: project.id, name: project.name, color: project.color })),
      analytics: buildWorkspaceAnalytics(
        projects.map((project) => ({ ...project, tasks: project.tasks.map(toAnalyticsTask) })),
        [...members.values()],
        range,
        now,
      ),
    })
    response.headers.set('Cache-Control', 'private, max-age=60')
    return response
  } catch (error) {
    console.error('Failed to fetch workspace analytics:', error)
    return NextResponse.json({ error: 'Failed to fetch workspace analytics' }, { status: 500 })
  }
}

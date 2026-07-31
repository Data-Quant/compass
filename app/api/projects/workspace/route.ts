import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { accessibleProjectsWhere, resolveProjectCapabilities } from '@/lib/project-access'
import { calculateProjectProgress, calculateTaskVariance } from '@/lib/project-progress'
import { PROJECT_TASK_INCLUDE } from '@/lib/project-task-data'

export async function GET() {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [savedPreference, people, projects] = await Promise.all([
      prisma.projectTaskViewPreference.findUnique({
        where: { userId: user.id },
        select: { assigneeFilter: true },
      }),
      prisma.user.findMany({
        where: {
          OR: [
            { payrollProfile: { is: null } },
            { payrollProfile: { is: { isPayrollActive: true } } },
          ],
        },
        select: {
          id: true,
          name: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.project.findMany({
        where: accessibleProjectsWhere(user),
        include: {
          owner: { select: { id: true, name: true } },
          members: {
            include: { user: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'asc' },
          },
          sections: { orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }] },
          labels: { orderBy: { name: 'asc' } },
          tasks: {
            include: PROJECT_TASK_INCLUDE,
            orderBy: [{ orderIndex: 'asc' }, { createdAt: 'desc' }],
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ])

    const savedFilter = savedPreference?.assigneeFilter || 'ME'
    const assigneeFilter = savedFilter === 'ALL' || savedFilter === 'ME' || people.some((person) => person.id === savedFilter)
      ? savedFilter
      : 'ME'
    const scopedAssigneeId = assigneeFilter === 'ALL'
      ? undefined
      : assigneeFilter === 'ME'
        ? user.id
        : assigneeFilter

    const serializedProjects = projects.map((project) => {
      const capabilities = resolveProjectCapabilities({
        viewer: user,
        ownerId: project.ownerId,
        members: project.members,
      })
      const progress = calculateProjectProgress(project.tasks, { assigneeId: scopedAssigneeId })
      const overallProgress = calculateProjectProgress(project.tasks)
      const taskRows = project.tasks.map((task) => ({
        ...task,
        variance: calculateTaskVariance(task),
      }))
      const visibleTasks = scopedAssigneeId
        ? taskRows.filter((task) => task.assigneeId === scopedAssigneeId)
        : taskRows

      return {
        id: project.id,
        name: project.name,
        description: project.description,
        color: project.color,
        status: project.status,
        ownerId: project.ownerId,
        owner: project.owner,
        members: project.members.map((membership) => ({
          ...membership.user,
          role: membership.role,
        })),
        sections: project.sections,
        labels: project.labels,
        tasks: taskRows,
        progress,
        overallProgress,
        hasVariance: visibleTasks.some((task) => task.variance.isOverdue),
        canManage: capabilities.canManage,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      }
    })

    return NextResponse.json({
      viewer: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
      preference: { assigneeFilter },
      people,
      projects: serializedProjects,
    })
  } catch (error) {
    console.error('Failed to fetch project workspace:', error)
    return NextResponse.json({ error: 'Failed to fetch project workspace' }, { status: 500 })
  }
}

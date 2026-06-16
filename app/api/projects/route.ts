import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { DEFAULT_STATUS_SECTIONS } from '@/lib/project-status-sections'
import { resolveProjectStatusForCompletion } from '@/lib/project-completion'
import { sendProjectInvitationNotification } from '@/lib/project-task-notifications'

// GET - List projects for the current user
export async function GET() {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } },
        ],
      },
      include: {
        owner: { select: { id: true, name: true } },
        members: { include: { user: { select: { id: true, name: true } } } },
        _count: { select: { tasks: true } },
        tasks: { where: { status: 'DONE' }, select: { id: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })

    // Self-heal stale statuses so projects that already hit 100% show as
    // completed without waiting for the next task change. Promote only here;
    // demotion happens on task mutations so a manual completion is not undone
    // on every list load.
    const corrections = projects.flatMap((p) => {
      const next = resolveProjectStatusForCompletion(p.status, p._count.tasks, p.tasks.length, {
        allowDemote: false,
      })
      return next ? [{ id: p.id, status: next }] : []
    })
    if (corrections.length > 0) {
      await Promise.all(
        corrections.map((c) => prisma.project.update({ where: { id: c.id }, data: { status: c.status } }))
      )
    }
    const correctedStatusById = new Map(corrections.map((c) => [c.id, c.status]))

    const result = projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      color: p.color,
      status: correctedStatusById.get(p.id) ?? p.status,
      owner: p.owner,
      members: p.members.map((m) => ({ ...m.user, role: m.role })),
      taskCount: p._count.tasks,
      completedTasks: p.tasks.length,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }))

    return NextResponse.json({ projects: result })
  } catch (error) {
    console.error('Failed to fetch projects:', error)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}

// POST - Create a new project
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name, description, memberIds, color } = await request.json()

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 })
    }

    const projectMemberIds = [
      ...new Set(
        (Array.isArray(memberIds) ? memberIds : [])
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
          .map((id) => id.trim())
          .filter((id) => id !== user.id)
      ),
    ]

    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        color: color || null,
        ownerId: user.id,
        members: {
          create: [
            { userId: user.id, role: 'OWNER' },
            ...projectMemberIds.map((id: string) => ({ userId: id, role: 'MEMBER' })),
          ],
        },
        sections: {
          create: DEFAULT_STATUS_SECTIONS.map((section) => ({
            name: section.name,
            color: section.color,
            canonicalStatus: section.canonicalStatus,
            isDefault: true,
            isDone: section.isDone,
            orderIndex: section.orderIndex,
          })),
        },
      },
      include: {
        owner: { select: { id: true, name: true } },
        members: { include: { user: { select: { id: true, name: true } } } },
        sections: true,
      },
    })

    await Promise.all(
      projectMemberIds.map(async (userId: string) => {
        try {
          await sendProjectInvitationNotification({
            projectId: project.id,
            userId,
            actorId: user.id,
            origin: request.nextUrl.origin,
          })
        } catch (emailError) {
          console.error('Failed to send project invitation notification:', emailError)
        }
      })
    )

    return NextResponse.json({ success: true, project })
  } catch (error) {
    console.error('Failed to create project:', error)
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

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

    const result = projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      color: p.color,
      status: p.status,
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

    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        color: color || null,
        ownerId: user.id,
        members: {
          create: [
            { userId: user.id, role: 'OWNER' },
            ...(memberIds || [])
              .filter((id: string) => id !== user.id)
              .map((id: string) => ({ userId: id, role: 'MEMBER' })),
          ],
        },
        sections: {
          create: [
            { name: 'To Do', orderIndex: 0 },
            { name: 'In Progress', orderIndex: 1 },
            { name: 'Done', orderIndex: 2 },
          ],
        },
      },
      include: {
        owner: { select: { id: true, name: true } },
        members: { include: { user: { select: { id: true, name: true } } } },
        sections: true,
      },
    })

    return NextResponse.json({ success: true, project })
  } catch (error) {
    console.error('Failed to create project:', error)
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}

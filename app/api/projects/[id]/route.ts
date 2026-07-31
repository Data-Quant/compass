import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureProjectStatusSections } from '@/lib/project-status-sections'
import { getProjectAuthorization, projectAuthorizationFailure } from '@/lib/project-access'
import { PROJECT_TASK_INCLUDE } from '@/lib/project-task-data'

// GET - Get project detail with tasks
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const authorization = await getProjectAuthorization(id, user)
    const authorizationFailure = projectAuthorizationFailure(authorization)
    if (authorizationFailure) {
      return NextResponse.json({ error: authorizationFailure.error }, { status: authorizationFailure.status })
    }
    await ensureProjectStatusSections(id)

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true } },
        members: { include: { user: { select: { id: true, name: true } } } },
        sections: { orderBy: { orderIndex: 'asc' } },
        labels: { orderBy: { name: 'asc' } },
        tasks: {
          include: PROJECT_TASK_INCLUDE,
          orderBy: [{ orderIndex: 'asc' }, { createdAt: 'desc' }],
        },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json({ project: { ...project, canManage: authorization.canManage } })
  } catch (error) {
    console.error('Failed to fetch project:', error)
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 })
  }
}

// PUT - Update project
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const authorization = await getProjectAuthorization(id, user)
    const authorizationFailure = projectAuthorizationFailure(authorization, 'manage')
    if (authorizationFailure) {
      return NextResponse.json({ error: authorizationFailure.error }, { status: authorizationFailure.status })
    }
    const { name, description, status, color } = await request.json()

    if (status !== undefined && !['ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid project status' }, { status: 400 })
    }
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return NextResponse.json({ error: 'Project name cannot be empty' }, { status: 400 })
    }

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(status && { status }),
        ...(color !== undefined && { color }),
      },
    })

    return NextResponse.json({ success: true, project })
  } catch (error) {
    console.error('Failed to update project:', error)
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
  }
}

// DELETE - Delete project
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params

    const authorization = await getProjectAuthorization(id, user)
    const authorizationFailure = projectAuthorizationFailure(authorization, 'manage')
    if (authorizationFailure) {
      return NextResponse.json({ error: authorizationFailure.error }, { status: authorizationFailure.status })
    }

    await prisma.project.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete project:', error)
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
  }
}

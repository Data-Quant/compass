import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  ensureProjectStatusSections,
  getDefaultProjectStatusSection,
  getStatusSectionDefaults,
  normalizeStatusName,
} from '@/lib/project-status-sections'
import { getProjectAuthorization, projectAuthorizationFailure } from '@/lib/project-access'
import { syncProjectCompletion } from '@/lib/project-completion'

const MAX_SECTION_ORDER_INDEX = 1_000_000_000

function isValidSectionOrderIndex(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= MAX_SECTION_ORDER_INDEX
}

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
    await ensureProjectStatusSections(projectId)

    const sections = await prisma.taskSection.findMany({
      where: { projectId },
      orderBy: { orderIndex: 'asc' },
      include: { _count: { select: { tasks: true } } },
    })

    return NextResponse.json({ sections })
  } catch (error) {
    console.error('Failed to fetch sections:', error)
    return NextResponse.json({ error: 'Failed to fetch sections' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id: projectId } = await params
    const authorization = await getProjectAuthorization(projectId, user)
    const authorizationFailure = projectAuthorizationFailure(authorization, 'manage')
    if (authorizationFailure) {
      return NextResponse.json({ error: authorizationFailure.error }, { status: authorizationFailure.status })
    }
    const { name } = await request.json()

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Section name is required' }, { status: 400 })
    }

    await ensureProjectStatusSections(projectId)

    const lastSection = await prisma.taskSection.findFirst({
      where: { projectId },
      orderBy: { orderIndex: 'desc' },
    })
    const orderIndex = Math.min(Math.max(0, lastSection?.orderIndex || 0) + 1, MAX_SECTION_ORDER_INDEX)
    const statusDefaults = getStatusSectionDefaults(name.trim(), orderIndex)

    if (statusDefaults.isDefault) {
      return NextResponse.json({ error: 'That name is reserved for a default project status' }, { status: 409 })
    }

    const section = await prisma.taskSection.create({
      data: {
        projectId,
        name: name.trim(),
        ...statusDefaults,
        orderIndex,
      },
    })

    return NextResponse.json({ success: true, section })
  } catch (error) {
    console.error('Failed to create section:', error)
    return NextResponse.json({ error: 'Failed to create section' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id: projectId } = await params
    const authorization = await getProjectAuthorization(projectId, user)
    const authorizationFailure = projectAuthorizationFailure(authorization, 'manage')
    if (authorizationFailure) {
      return NextResponse.json({ error: authorizationFailure.error }, { status: authorizationFailure.status })
    }

    const { sectionId, name, orderIndex, color } = await request.json()

    if (!sectionId) return NextResponse.json({ error: 'sectionId required' }, { status: 400 })

    const existing = await prisma.taskSection.findUnique({
      where: { id: sectionId },
      select: { id: true, projectId: true, name: true, isDefault: true, isBacklog: true },
    })
    if (!existing || existing.projectId !== projectId) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 })
    }
    if (name !== undefined && !String(name).trim()) {
      return NextResponse.json({ error: 'Section name cannot be empty' }, { status: 400 })
    }
    if (orderIndex !== undefined && !isValidSectionOrderIndex(orderIndex)) {
      return NextResponse.json({ error: 'orderIndex must be a non-negative integer' }, { status: 400 })
    }
    if (existing.isDefault && name !== undefined && String(name).trim() !== existing.name) {
      return NextResponse.json({ error: 'Default statuses cannot be renamed' }, { status: 400 })
    }
    if (existing.isBacklog && name !== undefined && normalizeStatusName(String(name)) !== 'backlog') {
      return NextResponse.json({ error: 'The default Backlog section cannot be renamed' }, { status: 400 })
    }
    if (!existing.isDefault && name !== undefined && getStatusSectionDefaults(String(name)).isDefault) {
      return NextResponse.json({ error: 'That name is reserved for a default project status' }, { status: 409 })
    }

    const section = await prisma.taskSection.update({
      where: { id: sectionId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(orderIndex !== undefined && { orderIndex }),
        ...(color !== undefined && { color }),
      },
    })

    return NextResponse.json({ success: true, section })
  } catch (error) {
    console.error('Failed to update section:', error)
    return NextResponse.json({ error: 'Failed to update section' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id: projectId } = await params
    const authorization = await getProjectAuthorization(projectId, user)
    const authorizationFailure = projectAuthorizationFailure(authorization, 'manage')
    if (authorizationFailure) {
      return NextResponse.json({ error: authorizationFailure.error }, { status: authorizationFailure.status })
    }

    const { searchParams } = new URL(request.url)
    const sectionId = searchParams.get('sectionId')

    if (!sectionId) return NextResponse.json({ error: 'sectionId required' }, { status: 400 })

    const section = await prisma.taskSection.findUnique({
      where: { id: sectionId },
      select: { id: true, projectId: true, isDefault: true },
    })
    if (!section || section.projectId !== projectId) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 })
    }
    if (section.isDefault) {
      return NextResponse.json({ error: 'Default statuses cannot be deleted' }, { status: 400 })
    }

    const todoSection = await getDefaultProjectStatusSection(section.projectId, 'TODO')
    if (!todoSection) {
      return NextResponse.json({ error: 'To Do status is missing for this project' }, { status: 400 })
    }

    // Move tasks and remove the custom status atomically so a failed delete
    // cannot leave a partially migrated project.
    await prisma.$transaction([
      prisma.task.updateMany({
        where: { sectionId },
        data: { sectionId: todoSection.id, status: 'TODO', completedAt: null },
      }),
      prisma.taskSection.delete({ where: { id: sectionId } }),
    ])
    try {
      await syncProjectCompletion(projectId)
    } catch (syncError) {
      console.error('Failed to sync project completion after deleting section:', syncError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete section:', error)
    return NextResponse.json({ error: 'Failed to delete section' }, { status: 500 })
  }
}

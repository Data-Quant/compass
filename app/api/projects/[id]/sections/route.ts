import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  ensureProjectStatusSections,
  getDefaultProjectStatusSection,
  getStatusSectionDefaults,
} from '@/lib/project-status-sections'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id: projectId } = await params
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
    const { name } = await request.json()

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Section name is required' }, { status: 400 })
    }

    await ensureProjectStatusSections(projectId)

    const lastSection = await prisma.taskSection.findFirst({
      where: { projectId },
      orderBy: { orderIndex: 'desc' },
    })
    const orderIndex = (lastSection?.orderIndex || 0) + 1
    const statusDefaults = getStatusSectionDefaults(name.trim(), orderIndex)

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

export async function PUT(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { sectionId, name, orderIndex, color } = await request.json()

    if (!sectionId) return NextResponse.json({ error: 'sectionId required' }, { status: 400 })

    const existing = await prisma.taskSection.findUnique({
      where: { id: sectionId },
      select: { id: true, isDefault: true },
    })
    if (!existing) return NextResponse.json({ error: 'Section not found' }, { status: 404 })

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

export async function DELETE(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const sectionId = searchParams.get('sectionId')

    if (!sectionId) return NextResponse.json({ error: 'sectionId required' }, { status: 400 })

    const section = await prisma.taskSection.findUnique({
      where: { id: sectionId },
      select: { id: true, projectId: true, isDefault: true },
    })
    if (!section) return NextResponse.json({ error: 'Section not found' }, { status: 404 })
    if (section.isDefault) {
      return NextResponse.json({ error: 'Default statuses cannot be deleted' }, { status: 400 })
    }

    const todoSection = await getDefaultProjectStatusSection(section.projectId, 'TODO')
    if (!todoSection) {
      return NextResponse.json({ error: 'To Do status is missing for this project' }, { status: 400 })
    }

    // Move tasks back to To Do before deleting a custom status.
    await prisma.task.updateMany({
      where: { sectionId },
      data: { sectionId: todoSection.id, status: 'TODO', completedAt: null },
    })

    await prisma.taskSection.delete({ where: { id: sectionId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete section:', error)
    return NextResponse.json({ error: 'Failed to delete section' }, { status: 500 })
  }
}

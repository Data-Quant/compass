import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id: projectId } = await params

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

    const lastSection = await prisma.taskSection.findFirst({
      where: { projectId },
      orderBy: { orderIndex: 'desc' },
    })

    const section = await prisma.taskSection.create({
      data: {
        projectId,
        name: name.trim(),
        orderIndex: (lastSection?.orderIndex || 0) + 1,
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
    const { sectionId, name, orderIndex } = await request.json()

    if (!sectionId) return NextResponse.json({ error: 'sectionId required' }, { status: 400 })

    const section = await prisma.taskSection.update({
      where: { id: sectionId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(orderIndex !== undefined && { orderIndex }),
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

    // Move tasks to unsectioned before deleting
    await prisma.task.updateMany({
      where: { sectionId },
      data: { sectionId: null },
    })

    await prisma.taskSection.delete({ where: { id: sectionId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete section:', error)
    return NextResponse.json({ error: 'Failed to delete section' }, { status: 500 })
  }
}

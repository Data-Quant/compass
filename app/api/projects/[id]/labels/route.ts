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

    const labels = await prisma.taskLabel.findMany({
      where: { projectId },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ labels })
  } catch (error) {
    console.error('Failed to fetch labels:', error)
    return NextResponse.json({ error: 'Failed to fetch labels' }, { status: 500 })
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
    const { name, color } = await request.json()

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Label name is required' }, { status: 400 })
    }

    const label = await prisma.taskLabel.create({
      data: {
        projectId,
        name: name.trim(),
        color: color || '#6366f1',
      },
    })

    return NextResponse.json({ success: true, label })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'Label name already exists' }, { status: 409 })
    }
    console.error('Failed to create label:', error)
    return NextResponse.json({ error: 'Failed to create label' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const labelId = searchParams.get('labelId')
    if (!labelId) return NextResponse.json({ error: 'labelId required' }, { status: 400 })

    await prisma.taskLabel.delete({ where: { id: labelId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete label:', error)
    return NextResponse.json({ error: 'Failed to delete label' }, { status: 500 })
  }
}

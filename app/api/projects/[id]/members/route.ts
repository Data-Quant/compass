import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id: projectId } = await params
    const { userId } = await request.json()

    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    const member = await prisma.projectMember.create({
      data: { projectId, userId, role: 'MEMBER' },
      include: { user: { select: { id: true, name: true } } },
    })

    return NextResponse.json({ success: true, member })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'User is already a member' }, { status: 409 })
    }
    console.error('Failed to add member:', error)
    return NextResponse.json({ error: 'Failed to add member' }, { status: 500 })
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

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    // Don't allow removing the owner
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    })

    if (!membership) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    if (membership.role === 'OWNER') {
      return NextResponse.json({ error: 'Cannot remove the project owner' }, { status: 403 })
    }

    await prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to remove member:', error)
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
  }
}

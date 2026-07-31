import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendProjectInvitationNotification } from '@/lib/project-task-notifications'
import { getProjectAuthorization, projectAuthorizationFailure } from '@/lib/project-access'

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
    const authorization = await getProjectAuthorization(projectId, user)
    const authorizationFailure = projectAuthorizationFailure(authorization, 'manage')
    if (authorizationFailure) {
      return NextResponse.json({ error: authorizationFailure.error }, { status: authorizationFailure.status })
    }

    const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const member = await prisma.projectMember.create({
      data: { projectId, userId, role: 'MEMBER' },
      include: { user: { select: { id: true, name: true } } },
    })

    try {
      await sendProjectInvitationNotification({
        projectId,
        userId,
        actorId: user.id,
        origin: request.nextUrl.origin,
      })
    } catch (emailError) {
      console.error('Failed to send project invitation notification:', emailError)
    }

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
    const authorization = await getProjectAuthorization(projectId, user)
    const authorizationFailure = projectAuthorizationFailure(authorization, 'manage')
    if (authorizationFailure) {
      return NextResponse.json({ error: authorizationFailure.error }, { status: authorizationFailure.status })
    }

    // Don't allow removing the owner
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    })

    if (!membership) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    if (userId === authorization.ownerId || membership.role.trim().toUpperCase() === 'OWNER') {
      return NextResponse.json({ error: 'Cannot remove the project owner' }, { status: 403 })
    }

    // Revoke task-derived access at the same time as membership. Leaving the
    // assignee relation in place would keep the removed user's My Tasks routes
    // pointed at a project they can no longer access.
    await prisma.$transaction([
      prisma.task.updateMany({
        where: { projectId, assigneeId: userId },
        data: { assigneeId: null },
      }),
      prisma.taskAssistant.deleteMany({
        where: { userId, task: { projectId } },
      }),
      prisma.projectMember.delete({
        where: { projectId_userId: { projectId, userId } },
      }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to remove member:', error)
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
  }
}

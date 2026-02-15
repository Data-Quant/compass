import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get('taskId')
    if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 })

    const comments = await prisma.taskComment.findMany({
      where: { taskId },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ comments })
  } catch (error) {
    console.error('Failed to fetch comments:', error)
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { taskId, content } = await request.json()
    if (!taskId || !content?.trim()) {
      return NextResponse.json({ error: 'taskId and content required' }, { status: 400 })
    }

    const comment = await prisma.taskComment.create({
      data: {
        taskId,
        authorId: user.id,
        content: content.trim(),
      },
      include: { author: { select: { id: true, name: true } } },
    })

    return NextResponse.json({ success: true, comment })
  } catch (error) {
    console.error('Failed to create comment:', error)
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const commentId = searchParams.get('commentId')
    if (!commentId) return NextResponse.json({ error: 'commentId required' }, { status: 400 })

    // Only allow deleting own comments
    const comment = await prisma.taskComment.findUnique({ where: { id: commentId } })
    if (!comment || comment.authorId !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    await prisma.taskComment.delete({ where: { id: commentId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete comment:', error)
    return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 })
  }
}

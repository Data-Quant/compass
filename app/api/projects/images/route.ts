import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024

function safeFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'task-image'
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN
    if (!blobToken) {
      return NextResponse.json(
        { error: 'Image uploads are not configured. Add BLOB_READ_WRITE_TOKEN in Vercel.' },
        { status: 500 }
      )
    }

    const formData = await request.formData()
    const projectId = String(formData.get('projectId') || '').trim()
    const file = formData.get('file')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A valid image file is required' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image uploads are supported' }, { status: 400 })
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: 'Image must be 5 MB or smaller' }, { status: 400 })
    }

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } },
        ],
      },
      select: { id: true },
    })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const blob = await put(
      `project-task-images/${projectId}/${Date.now()}-${safeFileName(file.name)}`,
      file,
      {
        access: 'private',
        addRandomSuffix: true,
        token: blobToken,
      }
    )

    return NextResponse.json({
      url: `/api/projects/images/file?pathname=${encodeURIComponent(blob.pathname)}`,
    })
  } catch (error) {
    console.error('Failed to upload project task image:', error)
    const message = error instanceof Error && error.message.includes('BLOB_READ_WRITE_TOKEN')
      ? 'Image uploads are not configured. Add BLOB_READ_WRITE_TOKEN in Vercel.'
      : 'Failed to upload image'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

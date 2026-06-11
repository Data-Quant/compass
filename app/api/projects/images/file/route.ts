import { NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

const IMAGE_PATH_PREFIX = 'project-task-images/'

function getProjectIdFromPathname(pathname: string) {
  if (!pathname.startsWith(IMAGE_PATH_PREFIX) || pathname.includes('..')) return null
  const [, projectId, fileName] = pathname.split('/')
  if (!projectId || !fileName) return null
  return projectId
}

export async function GET(request: NextRequest) {
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

    const pathname = request.nextUrl.searchParams.get('pathname') || ''
    const projectId = getProjectIdFromPathname(pathname)
    if (!projectId) {
      return NextResponse.json({ error: 'Invalid image path' }, { status: 400 })
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
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const result = await get(pathname, {
      access: 'private',
      token: blobToken,
      ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
    })

    if (!result) return new NextResponse('Not found', { status: 404 })
    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          'Cache-Control': 'private, no-cache',
        },
      })
    }
    if (result.statusCode !== 200 || !result.stream) {
      return new NextResponse('Not found', { status: 404 })
    }

    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        ETag: result.blob.etag,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (error) {
    console.error('Failed to fetch project task image:', error)
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 })
  }
}

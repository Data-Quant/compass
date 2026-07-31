import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  accessibleProjectsWhere,
  getProjectAuthorization,
  projectAuthorizationFailure,
} from '@/lib/project-access'

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')?.trim()

    const where = {
      ...(projectId
        ? { projectId }
        : {
            project: accessibleProjectsWhere(user),
          }),
    } as any

    if (projectId) {
      const authorization = await getProjectAuthorization(projectId, user)
      const authorizationFailure = projectAuthorizationFailure(authorization)
      if (authorizationFailure) {
        return NextResponse.json({ error: authorizationFailure.error }, { status: authorizationFailure.status })
      }
    }

    const references = await prisma.projectReference.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, color: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })

    return NextResponse.json({ references })
  } catch (error) {
    console.error('Failed to fetch project references:', error)
    return NextResponse.json({ error: 'Failed to fetch references' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { projectId, title, url, note } = await request.json()
    if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    if (!title?.trim()) return NextResponse.json({ error: 'title is required' }, { status: 400 })
    if (url && !isValidUrl(url)) return NextResponse.json({ error: 'url must be a valid http/https URL' }, { status: 400 })

    const authorization = await getProjectAuthorization(projectId, user)
    const authorizationFailure = projectAuthorizationFailure(authorization)
    if (authorizationFailure) {
      return NextResponse.json({ error: authorizationFailure.error }, { status: authorizationFailure.status })
    }

    const reference = await prisma.projectReference.create({
      data: {
        projectId,
        title: title.trim(),
        url: url?.trim() || null,
        note: note?.trim() || null,
        createdById: user.id,
      },
      include: {
        project: { select: { id: true, name: true, color: true } },
        createdBy: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({ success: true, reference })
  } catch (error) {
    console.error('Failed to create project reference:', error)
    return NextResponse.json({ error: 'Failed to create reference' }, { status: 500 })
  }
}

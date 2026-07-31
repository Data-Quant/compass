import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { resolveProjectCapabilities, type ProjectViewer } from '@/lib/project-access'

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

async function resolveReferenceWithAccess(referenceId: string, viewer: ProjectViewer) {
  const reference = await prisma.projectReference.findUnique({
    where: { id: referenceId },
    include: {
      project: {
        select: {
          id: true,
          ownerId: true,
          members: { select: { userId: true, role: true } },
        },
      },
    },
  })

  if (!reference) return { reference: null, hasAccess: false }
  const capabilities = resolveProjectCapabilities({
    viewer,
    ownerId: reference.project.ownerId,
    members: reference.project.members,
  })
  return { reference, hasAccess: capabilities.canAccess }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { reference, hasAccess } = await resolveReferenceWithAccess(id, user)
    if (!reference) return NextResponse.json({ error: 'Reference not found' }, { status: 404 })
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { title, url, note } = await request.json()

    if (title !== undefined && !String(title).trim()) {
      return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 })
    }
    if (url !== undefined && url && !isValidUrl(String(url))) {
      return NextResponse.json({ error: 'url must be a valid http/https URL' }, { status: 400 })
    }

    const updatedReference = await prisma.projectReference.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: String(title).trim() } : {}),
        ...(url !== undefined ? { url: url ? String(url).trim() : null } : {}),
        ...(note !== undefined ? { note: note ? String(note).trim() : null } : {}),
      },
      include: {
        project: { select: { id: true, name: true, color: true } },
        createdBy: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({ success: true, reference: updatedReference })
  } catch (error) {
    console.error('Failed to update project reference:', error)
    return NextResponse.json({ error: 'Failed to update reference' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { reference, hasAccess } = await resolveReferenceWithAccess(id, user)
    if (!reference) return NextResponse.json({ error: 'Reference not found' }, { status: 404 })
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    await prisma.projectReference.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete project reference:', error)
    return NextResponse.json({ error: 'Failed to delete reference' }, { status: 500 })
  }
}

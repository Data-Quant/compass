import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { ALL_TEAMS } from '@/lib/handbook/teams'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const {
      title,
      icon,
      category,
      orderIndex,
      linkHref,
      linkLabel,
      isPublished,
      intentionalGapTeams,
    } = (await request.json()) as {
      title?: string
      icon?: string
      category?: string
      orderIndex?: number
      linkHref?: string | null
      linkLabel?: string | null
      isPublished?: boolean
      intentionalGapTeams?: string[]
    }

    if (intentionalGapTeams) {
      const invalid = intentionalGapTeams.filter(
        (t) => !(ALL_TEAMS as readonly string[]).includes(t)
      )
      if (invalid.length) {
        return NextResponse.json(
          { error: `Invalid team(s): ${invalid.join(', ')}` },
          { status: 400 }
        )
      }
    }

    const page = await prisma.handbookPage.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(icon !== undefined ? { icon } : {}),
        ...(category !== undefined ? { category: category as never } : {}),
        ...(orderIndex !== undefined ? { orderIndex } : {}),
        ...(linkHref !== undefined ? { linkHref: linkHref || null } : {}),
        ...(linkLabel !== undefined ? { linkLabel: linkLabel || null } : {}),
        ...(isPublished !== undefined ? { isPublished } : {}),
        ...(intentionalGapTeams !== undefined
          ? { intentionalGapTeams: intentionalGapTeams as never }
          : {}),
      },
    })

    return NextResponse.json({ page })
  } catch (error) {
    console.error('Failed to update handbook page:', error)
    return NextResponse.json({ error: 'Failed to update page' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    // Variants and their audiences cascade.
    await prisma.handbookPage.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete handbook page:', error)
    return NextResponse.json({ error: 'Failed to delete page' }, { status: 500 })
  }
}

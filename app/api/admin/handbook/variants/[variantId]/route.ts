import { NextRequest, NextResponse } from 'next/server'
import type { TeamTag } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { ALL_TEAMS, TEAM_LABELS } from '@/lib/handbook/teams'
import { findOverlapForPage } from '@/lib/handbook/admin-queries'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ variantId: string }> }
) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { variantId } = await params
    const { bodyMarkdown, audiences } = (await request.json()) as {
      bodyMarkdown?: string
      audiences?: string[]
    }

    const existing = await prisma.handbookVariant.findUnique({
      where: { id: variantId },
      select: { pageId: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (audiences) {
      if (!audiences.length) {
        return NextResponse.json({ error: 'Select at least one team' }, { status: 400 })
      }
      const invalid = audiences.filter((t) => !(ALL_TEAMS as readonly string[]).includes(t))
      if (invalid.length) {
        return NextResponse.json(
          { error: `Invalid team(s): ${invalid.join(', ')}` },
          { status: 400 }
        )
      }

      // Excluding this variant by id is what lets an edit that keeps its own
      // teams save cleanly instead of colliding with itself.
      const overlap = await findOverlapForPage(existing.pageId, {
        variantId,
        audiences: audiences as TeamTag[],
      })
      if (overlap.length) {
        const names = overlap.map((t) => TEAM_LABELS[t]).join(', ')
        return NextResponse.json(
          { error: `Another variant of this page already covers: ${names}` },
          { status: 400 }
        )
      }
    }

    const variant = await prisma.$transaction(async (tx) => {
      if (audiences) {
        await tx.handbookAudience.deleteMany({ where: { variantId } })
        await tx.handbookAudience.createMany({
          data: audiences.map((team) => ({ variantId, team: team as TeamTag })),
        })
      }
      return tx.handbookVariant.update({
        where: { id: variantId },
        data: { ...(bodyMarkdown !== undefined ? { bodyMarkdown } : {}) },
        include: { audiences: { select: { team: true } } },
      })
    })

    return NextResponse.json({ variant })
  } catch (error) {
    console.error('Failed to update handbook variant:', error)
    return NextResponse.json({ error: 'Failed to update variant' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ variantId: string }> }
) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { variantId } = await params
    await prisma.handbookVariant.delete({ where: { id: variantId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete handbook variant:', error)
    return NextResponse.json({ error: 'Failed to delete variant' }, { status: 500 })
  }
}

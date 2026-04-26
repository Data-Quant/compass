import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  DECOR_DESK_ITEMS,
  DECOR_THEMES,
  DECOR_WALL_ITEMS,
} from '@/shared/office-world'
import { buildOfficeDirectory } from '@/lib/office-v2'

const decorSchema = z.object({
  theme: z.enum(DECOR_THEMES),
  deskItems: z.array(z.enum(DECOR_DESK_ITEMS)).max(3).default([]),
  wallItem: z.enum(DECOR_WALL_ITEMS).nullable().default(null),
}).strict()

/**
 * Updates the current user's cubicle (or lead/partner office) decor. The
 * route picks whichever assignment row exists — explicit cubicle assignment
 * first, then explicit lead/partner office. If no explicit row exists, we
 * fall back to the auto-derived seat from the office directory and create
 * an OfficeCubicleAssignment row to anchor the decor.
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = decorSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid decor', details: parsed.error.errors }, { status: 400 })
    }

    const decorJson = parsed.data

    // Lead/partner office assignment takes precedence over a cubicle since
    // anyone with a private office shouldn't also have a desk in the bullpen.
    const leadAssignment = await prisma.officeLeadershipOfficeAssignment.findUnique({
      where: { userId: user.id },
    })
    if (leadAssignment) {
      const updated = await prisma.officeLeadershipOfficeAssignment.update({
        where: { userId: user.id },
        data: { decorJson },
      })
      return NextResponse.json({ success: true, scope: 'leadership-office', officeId: updated.officeId, decor: decorJson })
    }

    const cubicleAssignment = await prisma.officeCubicleAssignment.findUnique({
      where: { userId: user.id },
    })
    if (cubicleAssignment) {
      const updated = await prisma.officeCubicleAssignment.update({
        where: { userId: user.id },
        data: { decorJson },
      })
      return NextResponse.json({ success: true, scope: 'cubicle', cubicleId: updated.cubicleId, decor: decorJson })
    }

    // No explicit assignment — anchor to the directory's auto-derived seat.
    const directory = await buildOfficeDirectory()
    const myCubicle = Object.entries(directory.cubicleAssignments)
      .find(([, e]) => e.userId === user.id)?.[0]
    if (myCubicle) {
      const created = await prisma.officeCubicleAssignment.create({
        data: { userId: user.id, cubicleId: myCubicle, decorJson },
      })
      return NextResponse.json({ success: true, scope: 'cubicle', cubicleId: created.cubicleId, decor: decorJson })
    }

    const myLead = Object.entries(directory.leadOfficeAssignments)
      .find(([, e]) => e.userId === user.id)?.[0]
    const myPartner = Object.entries(directory.partnerOfficeAssignments)
      .find(([, e]) => e.userId === user.id)?.[0]
    const officeId = myLead || myPartner
    if (officeId) {
      const created = await prisma.officeLeadershipOfficeAssignment.create({
        data: { userId: user.id, officeId, decorJson },
      })
      return NextResponse.json({ success: true, scope: 'leadership-office', officeId: created.officeId, decor: decorJson })
    }

    return NextResponse.json({ error: 'You do not have an assigned seat to decorate yet.' }, { status: 400 })
  } catch (error) {
    console.error('Failed to update office decor:', error)
    return NextResponse.json({ error: 'Failed to update decor' }, { status: 500 })
  }
}

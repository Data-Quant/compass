import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ASSET_STATUSES } from '@/lib/asset-utils'
import { ASSET_EVENT_TYPES, recordAssetEvent } from '@/lib/asset-events'
import { canManageAssets } from '@/lib/permissions'

interface RouteContext {
  params: Promise<{ id: string }>
}

const statusSchema = z.object({
  status: z.enum(ASSET_STATUSES),
  note: z.string().trim().max(5000).optional(),
})

// Manual lifecycle override: set any status directly (e.g. returned from repair,
// lost, disposed), bypassing the "can't change status while assigned" PATCH guard.
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManageAssets(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const parsed = statusSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const { status, note } = parsed.data

    if (status === 'ASSIGNED') {
      return NextResponse.json(
        { error: 'Use the assign action to put an asset into ASSIGNED status.' },
        { status: 400 }
      )
    }

    const existing = await prisma.equipmentAsset.findUnique({
      where: { id },
      select: { id: true, status: true, currentAssigneeId: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }
    if (existing.status === status) {
      return NextResponse.json(
        { error: `Asset is already in ${status.replace(/_/g, ' ')} status` },
        { status: 400 }
      )
    }

    const now = new Date()
    const updated = await prisma.$transaction(async (tx) => {
      // Any non-ASSIGNED status means the asset is no longer held by anyone: close
      // the active assignment and clear the current assignee.
      if (existing.currentAssigneeId) {
        await tx.equipmentAssignment.updateMany({
          where: { assetId: id, unassignedAt: null },
          data: {
            unassignedAt: now,
            unassignedById: user.id,
            returnNote: note || `Status changed to ${status.replace(/_/g, ' ')}`,
          },
        })
      }

      await tx.equipmentAsset.update({
        where: { id },
        data: { status, currentAssigneeId: null },
      })

      await recordAssetEvent(tx, {
        assetId: id,
        actorId: user.id,
        eventType: ASSET_EVENT_TYPES.STATUS_CHANGED,
        payload: { from: existing.status, to: status, note: note || null },
      })

      return tx.equipmentAsset.findUnique({
        where: { id },
        include: {
          currentAssignee: {
            select: { id: true, name: true, department: true, position: true },
          },
        },
      })
    })

    return NextResponse.json({ success: true, item: updated })
  } catch (error) {
    console.error('Failed to change asset status:', error)
    return NextResponse.json({ error: 'Failed to change asset status' }, { status: 500 })
  }
}

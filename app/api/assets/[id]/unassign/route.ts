import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManageAssets } from '@/lib/permissions'

interface RouteContext {
  params: Promise<{ id: string }>
}

const unassignSchema = z.object({
  note: z.string().trim().max(5000).optional(),
  setStatus: z.enum(['IN_STOCK', 'IN_REPAIR']).optional(),
})

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManageAssets(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: assetId } = await context.params
    const body = await request.json()
    const parsed = unassignSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const { note, setStatus } = parsed.data
    const asset = await prisma.equipmentAsset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        equipmentId: true,
        currentAssigneeId: true,
        status: true,
      },
    })

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }
    if (!asset.currentAssigneeId) {
      return NextResponse.json({ error: 'Asset is not currently assigned' }, { status: 400 })
    }

    const now = new Date()
    const nextStatus = setStatus || 'IN_STOCK'

    const result = await prisma.$transaction(async (tx) => {
      const closeResult = await tx.equipmentAssignment.updateMany({
        where: {
          assetId,
          unassignedAt: null,
        },
        data: {
          unassignedAt: now,
          unassignedById: user.id,
          returnNote: note || null,
        },
      })

      if (closeResult.count === 0) {
        throw new Error('No active assignment found for this asset')
      }

      await tx.equipmentAsset.update({
        where: { id: assetId },
        data: {
          currentAssigneeId: null,
          status: nextStatus,
        },
      })

      await tx.equipmentEvent.create({
        data: {
          assetId,
          actorId: user.id,
          eventType: 'ASSET_UNASSIGNED',
          payloadJson: {
            previousStatus: asset.status,
            nextStatus,
            note: note || null,
            at: now.toISOString(),
          } as Prisma.InputJsonValue,
        },
      })

      return tx.equipmentAsset.findUnique({
        where: { id: assetId },
        include: {
          currentAssignee: {
            select: { id: true, name: true, department: true, position: true, email: true },
          },
        },
      })
    })

    return NextResponse.json({ success: true, item: result })
  } catch (error) {
    if (error instanceof Error && error.message.includes('No active assignment')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Failed to unassign asset:', error)
    return NextResponse.json({ error: 'Failed to unassign asset' }, { status: 500 })
  }
}


import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canAssignInStatus } from '@/lib/asset-utils'
import { canManageAssets } from '@/lib/permissions'

interface RouteContext {
  params: Promise<{ id: string }>
}

const assignSchema = z.object({
  employeeId: z.string().trim().min(1),
  note: z
    .string()
    .trim()
    .max(5000)
    .optional(),
})

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManageAssets(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: assetId } = await context.params
    const body = await request.json()
    const parsed = assignSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const { employeeId, note } = parsed.data
    const [asset, employee] = await Promise.all([
      prisma.equipmentAsset.findUnique({
        where: { id: assetId },
        select: {
          id: true,
          equipmentId: true,
          status: true,
          currentAssigneeId: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: employeeId },
        select: { id: true, name: true, department: true, position: true, email: true },
      }),
    ])

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }
    if (!canAssignInStatus(asset.status)) {
      return NextResponse.json(
        { error: `Asset cannot be assigned while in ${asset.status} status` },
        { status: 400 }
      )
    }
    if (asset.currentAssigneeId === employee.id) {
      return NextResponse.json({ error: 'Asset is already assigned to this employee' }, { status: 400 })
    }

    const now = new Date()
    const result = await prisma.$transaction(async (tx) => {
      await tx.equipmentAssignment.updateMany({
        where: {
          assetId,
          unassignedAt: null,
        },
        data: {
          unassignedAt: now,
          unassignedById: user.id,
          returnNote: `Reassigned to ${employee.name}`,
        },
      })

      await tx.equipmentAssignment.create({
        data: {
          assetId,
          employeeId: employee.id,
          assignedById: user.id,
          assignedAt: now,
          assignmentNote: note || null,
        },
      })

      await tx.equipmentAsset.update({
        where: { id: assetId },
        data: {
          currentAssigneeId: employee.id,
          status: 'ASSIGNED',
        },
      })

      await tx.equipmentEvent.create({
        data: {
          assetId,
          actorId: user.id,
          eventType: 'ASSET_ASSIGNED',
          payloadJson: {
            employeeId: employee.id,
            employeeName: employee.name,
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
    console.error('Failed to assign asset:', error)
    return NextResponse.json({ error: 'Failed to assign asset' }, { status: 500 })
  }
}


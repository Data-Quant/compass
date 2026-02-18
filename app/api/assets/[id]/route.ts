import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  ASSET_CONDITIONS,
  ASSET_STATUSES,
  ensureWarrantyDateOrder,
  parseNullableDate,
  parseNullableNumber,
} from '@/lib/asset-utils'
import { canManageAssets } from '@/lib/permissions'

interface RouteContext {
  params: Promise<{ id: string }>
}

const optionalUpdateString = z.preprocess(
  (value) => {
    if (value === undefined) return undefined
    if (value === null) return null
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  },
  z.string().max(500).nullable().optional()
)

const updateAssetSchema = z
  .object({
    assetName: z.string().trim().min(1).max(200).optional(),
    category: z.string().trim().min(1).max(120).optional(),
    brand: optionalUpdateString,
    model: optionalUpdateString,
    serialNumber: optionalUpdateString,
    specsJson: z.unknown().optional(),
    purchaseCost: z.union([z.number(), z.string(), z.null()]).optional(),
    purchaseCurrency: optionalUpdateString,
    purchaseDate: z.union([z.string(), z.null()]).optional(),
    warrantyStartDate: z.union([z.string(), z.null()]).optional(),
    warrantyEndDate: z.union([z.string(), z.null()]).optional(),
    vendor: optionalUpdateString,
    status: z.enum(ASSET_STATUSES).optional(),
    condition: z.enum(ASSET_CONDITIONS).optional(),
    location: optionalUpdateString,
    notes: z.preprocess(
      (value) => {
        if (value === undefined) return undefined
        if (value === null) return null
        if (typeof value !== 'string') return value
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
      },
      z.string().max(5000).nullable().optional()
    ),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  })

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManageAssets(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const item = await prisma.equipmentAsset.findUnique({
      where: { id },
      include: {
        currentAssignee: {
          select: { id: true, name: true, department: true, position: true, email: true },
        },
        assignments: {
          include: {
            employee: { select: { id: true, name: true, department: true, position: true, email: true } },
            assignedBy: { select: { id: true, name: true, role: true } },
            unassignedBy: { select: { id: true, name: true, role: true } },
          },
          orderBy: { assignedAt: 'desc' },
        },
        events: {
          include: {
            actor: { select: { id: true, name: true, role: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!item) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }

    return NextResponse.json({ item })
  } catch (error) {
    console.error('Failed to fetch asset detail:', error)
    return NextResponse.json({ error: 'Failed to fetch asset detail' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManageAssets(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const body = await request.json()
    const parsed = updateAssetSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const existing = await prisma.equipmentAsset.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        currentAssigneeId: true,
        purchaseDate: true,
        warrantyEndDate: true,
      },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }

    const payload = parsed.data
    const parsedPurchaseDate =
      payload.purchaseDate !== undefined
        ? parseNullableDate(payload.purchaseDate)
        : existing.purchaseDate
    const parsedWarrantyEndDate =
      payload.warrantyEndDate !== undefined
        ? parseNullableDate(payload.warrantyEndDate)
        : existing.warrantyEndDate
    const parsedWarrantyStartDate =
      payload.warrantyStartDate !== undefined
        ? parseNullableDate(payload.warrantyStartDate)
        : undefined
    const parsedPurchaseCost =
      payload.purchaseCost !== undefined ? parseNullableNumber(payload.purchaseCost) : undefined

    if (payload.purchaseCost !== undefined && parsedPurchaseCost === null && payload.purchaseCost !== null && payload.purchaseCost !== '') {
      return NextResponse.json({ error: 'Invalid purchaseCost value' }, { status: 400 })
    }
    if (parsedPurchaseCost !== undefined && parsedPurchaseCost !== null && parsedPurchaseCost < 0) {
      return NextResponse.json({ error: 'purchaseCost cannot be negative' }, { status: 400 })
    }

    const dateOrderError = ensureWarrantyDateOrder(parsedPurchaseDate, parsedWarrantyEndDate)
    if (dateOrderError) {
      return NextResponse.json({ error: dateOrderError }, { status: 400 })
    }

    if (payload.status === 'ASSIGNED' && !existing.currentAssigneeId) {
      return NextResponse.json(
        { error: 'Cannot set status to ASSIGNED without an assignee. Use the assign endpoint.' },
        { status: 400 }
      )
    }

    if (
      existing.currentAssigneeId &&
      payload.status !== undefined &&
      payload.status !== 'ASSIGNED'
    ) {
      return NextResponse.json(
        { error: 'Cannot change status for an assigned asset. Use unassign endpoint first.' },
        { status: 400 }
      )
    }

    const updateData: Prisma.EquipmentAssetUpdateInput = {}
    if (payload.assetName !== undefined) updateData.assetName = payload.assetName.trim()
    if (payload.category !== undefined) updateData.category = payload.category.trim()
    if (payload.brand !== undefined) updateData.brand = payload.brand
    if (payload.model !== undefined) updateData.model = payload.model
    if (payload.serialNumber !== undefined) updateData.serialNumber = payload.serialNumber
    if (payload.specsJson !== undefined) updateData.specsJson = payload.specsJson as Prisma.InputJsonValue
    if (payload.purchaseCost !== undefined) updateData.purchaseCost = parsedPurchaseCost
    if (payload.purchaseCurrency !== undefined) updateData.purchaseCurrency = payload.purchaseCurrency || 'PKR'
    if (payload.purchaseDate !== undefined) updateData.purchaseDate = parsedPurchaseDate
    if (payload.warrantyStartDate !== undefined) updateData.warrantyStartDate = parsedWarrantyStartDate || null
    if (payload.warrantyEndDate !== undefined) updateData.warrantyEndDate = parsedWarrantyEndDate
    if (payload.vendor !== undefined) updateData.vendor = payload.vendor
    if (payload.status !== undefined) updateData.status = payload.status
    if (payload.condition !== undefined) updateData.condition = payload.condition
    if (payload.location !== undefined) updateData.location = payload.location
    if (payload.notes !== undefined) updateData.notes = payload.notes

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.equipmentAsset.update({
        where: { id },
        data: updateData,
      })

      await tx.equipmentEvent.create({
        data: {
          assetId: id,
          actorId: user.id,
          eventType: 'ASSET_UPDATED',
          payloadJson: {
            fields: Object.keys(updateData),
            statusBefore: existing.status,
            statusAfter: next.status,
          } as Prisma.InputJsonValue,
        },
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
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return NextResponse.json({ error: 'equipmentId or serialNumber already exists' }, { status: 409 })
    }
    console.error('Failed to update asset:', error)
    return NextResponse.json({ error: 'Failed to update asset' }, { status: 500 })
  }
}


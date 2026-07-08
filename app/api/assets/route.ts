import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  ASSET_CATEGORY_VALUES,
  ASSET_LOCATIONS,
  ASSET_CONDITIONS,
  ASSET_STATUSES,
  PURCHASE_TYPES,
  ensureWarrantyDateOrder,
  getNextEquipmentId,
  getAssetCategoryMeta,
  getAssetLocationValuesForFilter,
  getEquipmentIdPrefix,
  isAssetCategory,
  isAssetLocation,
  normalizeEquipmentId,
  normalizeAssetLocation,
  normalizePurchaseType,
  parseNullableDate,
  parseNullableNumber,
} from '@/lib/asset-utils'
import { canManageAssets } from '@/lib/permissions'

const optionalTrimmedString = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return undefined
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
  },
  z.string().max(500).optional()
)

const optionalEquipmentId = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return undefined
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
  },
  z.string().max(120).optional()
)

const createAssetSchema = z.object({
  equipmentId: optionalEquipmentId,
  assetName: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(120),
  brand: optionalTrimmedString,
  model: optionalTrimmedString,
  serialNumber: optionalTrimmedString,
  specsJson: z.unknown().optional(),
  purchaseCost: z.union([z.number(), z.string(), z.null()]).optional(),
  purchaseCurrency: optionalTrimmedString,
  purchaseType: optionalTrimmedString,
  purchaseDate: z.union([z.string(), z.null()]).optional(),
  warrantyStartDate: z.union([z.string(), z.null()]).optional(),
  warrantyEndDate: z.union([z.string(), z.null()]).optional(),
  vendor: optionalTrimmedString,
  status: z.enum(ASSET_STATUSES).optional(),
  condition: z.enum(ASSET_CONDITIONS).optional(),
  location: optionalTrimmedString,
  notes: z.preprocess(
    (value) => {
      if (value === undefined || value === null) return undefined
      if (typeof value !== 'string') return value
      const trimmed = value.trim()
      return trimmed === '' ? undefined : trimmed
    },
    z.string().max(5000).optional()
  ),
})

function isEquipmentIdUniqueError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false
  return String(error.meta?.target || '').includes('equipmentId')
}

async function loadNextEquipmentId(
  category: string,
  client: typeof prisma | Prisma.TransactionClient = prisma
) {
  const prefix = getEquipmentIdPrefix(category)
  const existing = await client.equipmentAsset.findMany({
    where: { equipmentId: { startsWith: `${prefix}-`, mode: 'insensitive' } },
    select: { equipmentId: true },
  })
  return getNextEquipmentId(category, existing.map((asset) => asset.equipmentId))
}

function parseQueryInt(value: string | null, defaultValue: number, min: number, max: number) {
  if (!value) return defaultValue
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return defaultValue
  return Math.max(min, Math.min(max, Math.trunc(parsed)))
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManageAssets(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') || '').trim()
    const status = (searchParams.get('status') || '').trim()
    const category = (searchParams.get('category') || '').trim()
    const assigneeId = (searchParams.get('assigneeId') || '').trim()
    const location = (searchParams.get('location') || '').trim()
    const purchaseTypeFilter = (searchParams.get('purchaseType') || '').trim()
    const normalizedPurchaseType = normalizePurchaseType(purchaseTypeFilter)
    const warranty = (searchParams.get('warranty') || 'all').trim().toLowerCase()
    const page = parseQueryInt(searchParams.get('page'), 1, 1, 100000)
    const limit = parseQueryInt(searchParams.get('limit'), 20, 1, 100)

    if (status && !ASSET_STATUSES.includes(status as (typeof ASSET_STATUSES)[number])) {
      return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 })
    }

    if (location && !isAssetLocation(location)) {
      return NextResponse.json({ error: 'Invalid location filter' }, { status: 400 })
    }

    if (purchaseTypeFilter && !normalizedPurchaseType) {
      return NextResponse.json({ error: 'Invalid purchase type filter' }, { status: 400 })
    }

    if (!['all', 'expiring', 'expired'].includes(warranty)) {
      return NextResponse.json({ error: 'Invalid warranty filter' }, { status: 400 })
    }

    const where: Prisma.EquipmentAssetWhereInput = {}
    if (status) where.status = status as (typeof ASSET_STATUSES)[number]
    if (category) where.category = { equals: category, mode: 'insensitive' }
    if (assigneeId) where.currentAssigneeId = assigneeId
    if (location) where.location = { in: getAssetLocationValuesForFilter(location) }
    if (normalizedPurchaseType) where.purchaseType = normalizedPurchaseType

    if (warranty === 'expiring') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const threshold = new Date(today)
      threshold.setDate(threshold.getDate() + 30)
      where.warrantyEndDate = {
        gte: today,
        lte: threshold,
      }
    } else if (warranty === 'expired') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      where.warrantyEndDate = {
        lt: today,
      }
    }

    if (q) {
      where.OR = [
        { equipmentId: { contains: q, mode: 'insensitive' } },
        { assetName: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
        { model: { contains: q, mode: 'insensitive' } },
        { serialNumber: { contains: q, mode: 'insensitive' } },
        { vendor: { contains: q, mode: 'insensitive' } },
        { location: { contains: q, mode: 'insensitive' } },
        { currentAssignee: { name: { contains: q, mode: 'insensitive' } } },
      ]
    }

    const skip = (page - 1) * limit
    const [items, total] = await Promise.all([
      prisma.equipmentAsset.findMany({
        where,
        include: {
          currentAssignee: {
            select: {
              id: true,
              name: true,
              department: true,
              position: true,
            },
          },
          _count: {
            select: { assignments: true, events: true },
          },
        },
        orderBy: [{ updatedAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.equipmentAsset.count({ where }),
    ])

    return NextResponse.json({
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Failed to fetch assets:', error)
    return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManageAssets(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = createAssetSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const payload = parsed.data

    if (!isAssetCategory(payload.category)) {
      return NextResponse.json(
        { error: `Category must be one of: ${ASSET_CATEGORY_VALUES.join(', ')}` },
        { status: 400 }
      )
    }
    // Canonicalize to the predefined value (fixes casing) for consistent storage.
    const category = getAssetCategoryMeta(payload.category)?.value || payload.category.trim()

    const manualEquipmentId = payload.equipmentId ? normalizeEquipmentId(payload.equipmentId) : null
    const purchaseDate = parseNullableDate(payload.purchaseDate)
    const warrantyStartDate = parseNullableDate(payload.warrantyStartDate)
    const warrantyEndDate = parseNullableDate(payload.warrantyEndDate)
    const purchaseCost = parseNullableNumber(payload.purchaseCost)
    const location = normalizeAssetLocation(payload.location)
    const purchaseType = normalizePurchaseType(payload.purchaseType)

    if (payload.purchaseCost !== undefined && purchaseCost === null) {
      return NextResponse.json({ error: 'Invalid purchaseCost value' }, { status: 400 })
    }
    if (payload.location && !location) {
      return NextResponse.json(
        { error: `Location must be one of: ${ASSET_LOCATIONS.join(', ')}` },
        { status: 400 }
      )
    }
    if (payload.purchaseType && !purchaseType) {
      return NextResponse.json(
        { error: `Purchase type must be one of: ${PURCHASE_TYPES.join(', ')}` },
        { status: 400 }
      )
    }
    if (purchaseCost !== null && purchaseCost < 0) {
      return NextResponse.json({ error: 'purchaseCost cannot be negative' }, { status: 400 })
    }

    const dateOrderError = ensureWarrantyDateOrder(purchaseDate, warrantyEndDate)
    if (dateOrderError) {
      return NextResponse.json({ error: dateOrderError }, { status: 400 })
    }

    let equipmentId = manualEquipmentId || await loadNextEquipmentId(category)
    const attempts = manualEquipmentId ? 1 : 2

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const created = await prisma.$transaction(async (tx) => {
          const asset = await tx.equipmentAsset.create({
            data: {
              equipmentId,
              assetName: payload.assetName.trim(),
              category,
              brand: payload.brand || null,
              model: payload.model || null,
              serialNumber: payload.serialNumber || null,
              specsJson: payload.specsJson === undefined ? Prisma.JsonNull : (payload.specsJson as Prisma.InputJsonValue),
              purchaseCost,
              purchaseCurrency: payload.purchaseCurrency || 'PKR',
              purchaseType,
              purchaseDate,
              warrantyStartDate,
              warrantyEndDate,
              vendor: payload.vendor || null,
              status: payload.status || 'IN_STOCK',
              condition: payload.condition || 'GOOD',
              location,
              notes: payload.notes || null,
            },
          })

          await tx.equipmentEvent.create({
            data: {
              assetId: asset.id,
              actorId: user.id,
              eventType: 'ASSET_CREATED',
              payloadJson: {
                equipmentId: asset.equipmentId,
                status: asset.status,
              } as Prisma.InputJsonValue,
            },
          })

          return tx.equipmentAsset.findUnique({
            where: { id: asset.id },
            include: {
              currentAssignee: {
                select: { id: true, name: true, department: true, position: true },
              },
            },
          })
        })

        return NextResponse.json({ success: true, item: created })
      } catch (error) {
        if (!manualEquipmentId && attempt === 0 && isEquipmentIdUniqueError(error)) {
          equipmentId = await loadNextEquipmentId(category)
          continue
        }
        throw error
      }
    }

    return NextResponse.json({ error: 'Failed to create asset' }, { status: 500 })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return NextResponse.json({ error: 'equipmentId or serialNumber already exists' }, { status: 409 })
    }
    console.error('Failed to create asset:', error)
    return NextResponse.json({ error: 'Failed to create asset' }, { status: 500 })
  }
}


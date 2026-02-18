import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import { Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  ASSET_CONDITIONS,
  ASSET_STATUSES,
  ensureWarrantyDateOrder,
  normalizeEquipmentId,
  parseNullableDate,
  parseNullableNumber,
} from '@/lib/asset-utils'
import { canManageAssets } from '@/lib/permissions'

export const runtime = 'nodejs'

type CsvRow = Record<string, string | undefined>

const headerAliases: Record<string, string[]> = {
  equipmentId: ['equipmentid', 'equipment_id', 'assetid', 'asset_id', 'id'],
  assetName: ['assetname', 'asset_name', 'name'],
  category: ['category', 'type', 'asset_type'],
  brand: ['brand', 'make'],
  model: ['model'],
  serialNumber: ['serialnumber', 'serial_number', 'serial'],
  specsJson: ['specsjson', 'specs_json', 'specs'],
  purchaseCost: ['purchasecost', 'purchase_cost', 'cost', 'price'],
  purchaseCurrency: ['purchasecurrency', 'purchase_currency', 'currency'],
  purchaseDate: ['purchasedate', 'purchase_date'],
  warrantyStartDate: ['warrantystartdate', 'warranty_start_date'],
  warrantyEndDate: ['warrantyenddate', 'warranty_end_date', 'warrantyexpiry', 'warranty_expiry'],
  vendor: ['vendor', 'supplier'],
  status: ['status'],
  condition: ['condition'],
  location: ['location'],
  notes: ['notes', 'note'],
}

function normalizeHeader(header: string): string {
  return header.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}

function pickField(row: CsvRow, key: keyof typeof headerAliases): string {
  for (const alias of headerAliases[key]) {
    for (const [rawHeader, rawValue] of Object.entries(row)) {
      if (normalizeHeader(rawHeader) === alias) {
        return (rawValue || '').trim()
      }
    }
  }
  return ''
}

function parseSpecsJson(raw: string): Prisma.InputJsonValue | null {
  const value = raw.trim()
  if (!value) return null
  try {
    return JSON.parse(value) as Prisma.InputJsonValue
  } catch {
    return value
  }
}

function toNullableJsonValue(
  value: Prisma.InputJsonValue | null
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return value === null ? Prisma.JsonNull : value
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManageAssets(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required and must be a valid upload' }, { status: 400 })
    }

    const text = await file.text()
    const parsed = Papa.parse<CsvRow>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
    })

    const rowErrors: Array<{ row: number; message: string }> = []
    for (const parseError of parsed.errors) {
      rowErrors.push({
        row: (parseError.row ?? 0) + 2,
        message: parseError.message,
      })
    }

    let createdCount = 0
    let updatedCount = 0

    for (let i = 0; i < parsed.data.length; i++) {
      const row = parsed.data[i]
      const rowNumber = i + 2

      const equipmentIdRaw = pickField(row, 'equipmentId')
      const assetName = pickField(row, 'assetName')
      const category = pickField(row, 'category')
      const brand = pickField(row, 'brand') || null
      const model = pickField(row, 'model') || null
      const serialNumber = pickField(row, 'serialNumber') || null
      const specsRaw = pickField(row, 'specsJson')
      const purchaseCostRaw = pickField(row, 'purchaseCost')
      const purchaseCurrency = pickField(row, 'purchaseCurrency') || 'PKR'
      const purchaseDateRaw = pickField(row, 'purchaseDate')
      const warrantyStartRaw = pickField(row, 'warrantyStartDate')
      const warrantyEndRaw = pickField(row, 'warrantyEndDate')
      const vendor = pickField(row, 'vendor') || null
      const statusRaw = pickField(row, 'status').toUpperCase()
      const conditionRaw = pickField(row, 'condition').toUpperCase()
      const location = pickField(row, 'location') || null
      const notes = pickField(row, 'notes') || null

      if (!equipmentIdRaw || !assetName || !category) {
        rowErrors.push({
          row: rowNumber,
          message: 'equipmentId, assetName, and category are required',
        })
        continue
      }

      const equipmentId = normalizeEquipmentId(equipmentIdRaw)
      const purchaseCost = parseNullableNumber(purchaseCostRaw)
      const purchaseDate = parseNullableDate(purchaseDateRaw)
      const warrantyStartDate = parseNullableDate(warrantyStartRaw)
      const warrantyEndDate = parseNullableDate(warrantyEndRaw)
      const specsJson = toNullableJsonValue(parseSpecsJson(specsRaw))
      const status = statusRaw
        ? (statusRaw as (typeof ASSET_STATUSES)[number])
        : 'IN_STOCK'
      const condition = conditionRaw
        ? (conditionRaw as (typeof ASSET_CONDITIONS)[number])
        : 'GOOD'

      if (purchaseCostRaw && purchaseCost === null) {
        rowErrors.push({ row: rowNumber, message: 'Invalid purchaseCost value' })
        continue
      }
      if (purchaseCost !== null && purchaseCost < 0) {
        rowErrors.push({ row: rowNumber, message: 'purchaseCost cannot be negative' })
        continue
      }
      if (statusRaw && !ASSET_STATUSES.includes(status)) {
        rowErrors.push({ row: rowNumber, message: `Invalid status "${statusRaw}"` })
        continue
      }
      if (conditionRaw && !ASSET_CONDITIONS.includes(condition)) {
        rowErrors.push({ row: rowNumber, message: `Invalid condition "${conditionRaw}"` })
        continue
      }
      const dateOrderError = ensureWarrantyDateOrder(purchaseDate, warrantyEndDate)
      if (dateOrderError) {
        rowErrors.push({ row: rowNumber, message: dateOrderError })
        continue
      }

      try {
        const existing = await prisma.equipmentAsset.findUnique({
          where: { equipmentId },
          select: { id: true },
        })

        if (!existing) {
          const created = await prisma.equipmentAsset.create({
            data: {
              equipmentId,
              assetName,
              category,
              brand,
              model,
              serialNumber,
              specsJson,
              purchaseCost,
              purchaseCurrency,
              purchaseDate,
              warrantyStartDate,
              warrantyEndDate,
              vendor,
              status,
              condition,
              location,
              notes,
            },
            select: { id: true, equipmentId: true },
          })

          await prisma.equipmentEvent.create({
            data: {
              assetId: created.id,
              actorId: user.id,
              eventType: 'ASSET_IMPORTED_CREATED',
              payloadJson: {
                equipmentId: created.equipmentId,
                rowNumber,
                fileName: file.name,
              } as Prisma.InputJsonValue,
            },
          })

          createdCount += 1
          continue
        }

        await prisma.equipmentAsset.update({
          where: { id: existing.id },
          data: {
            assetName,
            category,
            brand,
            model,
            serialNumber,
            specsJson,
            purchaseCost,
            purchaseCurrency,
            purchaseDate,
            warrantyStartDate,
            warrantyEndDate,
            vendor,
            status,
            condition,
            location,
            notes,
          },
        })

        await prisma.equipmentEvent.create({
          data: {
            assetId: existing.id,
            actorId: user.id,
            eventType: 'ASSET_IMPORTED_UPDATED',
            payloadJson: {
              equipmentId,
              rowNumber,
              fileName: file.name,
            } as Prisma.InputJsonValue,
          },
        })

        updatedCount += 1
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          rowErrors.push({
            row: rowNumber,
            message: 'Duplicate equipmentId or serialNumber',
          })
          continue
        }

        rowErrors.push({
          row: rowNumber,
          message: error instanceof Error ? error.message : 'Import error',
        })
      }
    }

    return NextResponse.json({
      success: true,
      imported: createdCount + updatedCount,
      created: createdCount,
      updated: updatedCount,
      errors: rowErrors,
    })
  } catch (error) {
    console.error('Failed to import assets:', error)
    return NextResponse.json({ error: 'Failed to import assets' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManagePayroll } from '@/lib/permissions'
import { parsePayrollWorkbook } from '@/lib/payroll/workbook-parser'
import { periodKeyToDate, periodLabelFromKey } from '@/lib/payroll/normalizers'
import { syncPayrollIdentityMappings } from '@/lib/payroll/matching'
import type { Prisma } from '@prisma/client'

export const runtime = 'nodejs'

const CHUNK_SIZE = 500

function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999))
}

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size))
  }
  return output
}

async function ensurePeriodIdForKey(
  periodKey: string,
  createdById: string,
  sourceType: 'WORKBOOK' | 'MANUAL' | 'CARRY_FORWARD'
) {
  const start = periodKeyToDate(periodKey)
  if (!start) return null
  const monthEnd = endOfMonth(start)
  const monthAfter = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))

  const existing = await prisma.payrollPeriod.findFirst({
    where: {
      periodStart: {
        gte: start,
        lt: monthAfter,
      },
    },
    select: { id: true },
  })
  if (existing) return existing.id

  const created = await prisma.payrollPeriod.create({
    data: {
      label: periodLabelFromKey(periodKey),
      periodStart: start,
      periodEnd: monthEnd,
      sourceType,
      status: 'DRAFT',
      createdById,
    },
    select: { id: true },
  })
  return created.id
}

export async function POST(request: NextRequest) {
  let batchId: string | null = null

  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const form = await request.formData()
    const file = form.get('file')
    const periodId = typeof form.get('periodId') === 'string' ? String(form.get('periodId')).trim() : ''
    const sourceTypeRaw =
      typeof form.get('sourceType') === 'string'
        ? String(form.get('sourceType')).toUpperCase()
        : 'WORKBOOK'
    const sourceType =
      sourceTypeRaw === 'MANUAL' || sourceTypeRaw === 'CARRY_FORWARD' ? sourceTypeRaw : 'WORKBOOK'

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required and must be a valid upload' }, { status: 400 })
    }

    if (periodId) {
      const target = await prisma.payrollPeriod.findUnique({
        where: { id: periodId },
        select: { id: true },
      })
      if (!target) {
        return NextResponse.json({ error: 'periodId does not exist' }, { status: 400 })
      }
    }

    const batch = await prisma.payrollImportBatch.create({
      data: {
        sourceType,
        fileName: file.name || null,
        importedById: user.id,
        periodId: periodId || null,
        status: 'PROCESSING',
      },
      select: { id: true },
    })
    batchId = batch.id

    const arrayBuffer = await file.arrayBuffer()
    const parsed = await parsePayrollWorkbook(Buffer.from(arrayBuffer))

    const mappingSummary = await syncPayrollIdentityMappings(parsed.payrollNames)
    const mappings = await prisma.payrollIdentityMapping.findMany({
      where: {
        normalizedPayrollName: {
          in: parsed.inputValues.map((v) => v.normalizedPayrollName),
        },
      },
      select: {
        normalizedPayrollName: true,
        userId: true,
      },
    })
    const mappingByNormalized = new Map(mappings.map((row) => [row.normalizedPayrollName, row.userId]))

    const periodIdByKey = new Map<string, string>()
    if (periodId) {
      for (const key of parsed.periodKeys) {
        periodIdByKey.set(key, periodId)
      }
    } else {
      const sortedKeys = [...parsed.periodKeys].sort((a, b) => {
        const aDate = periodKeyToDate(a)?.getTime() || 0
        const bDate = periodKeyToDate(b)?.getTime() || 0
        return aDate - bDate
      })
      for (const key of sortedKeys) {
        const ensured = await ensurePeriodIdForKey(key, user.id, sourceType)
        if (ensured) periodIdByKey.set(key, ensured)
      }
    }

    if (parsed.periodKeys.length > 0 && periodIdByKey.size === 0) {
      throw new Error('Failed to resolve payroll periods from workbook period keys')
    }

    if (parsed.importRows.length > 0) {
      for (const rows of chunk(parsed.importRows, CHUNK_SIZE)) {
        await prisma.payrollImportRow.createMany({
          data: rows.map((row) => ({
            batchId: batch.id,
            sheetName: row.sheetName,
            rowNumber: row.rowNumber,
            rowJson: row.rowJson as Prisma.InputJsonValue,
            periodKey: row.periodKey || null,
            payrollName: row.payrollName || null,
            normalizedName: row.normalizedName || null,
          })),
        })
      }
    }

    let importedInputs = 0
    for (const value of parsed.inputValues) {
      const targetPeriodId = periodId || periodIdByKey.get(value.periodKey)
      if (!targetPeriodId) continue

      await prisma.payrollInputValue.upsert({
        where: {
          periodId_payrollName_componentKey: {
            periodId: targetPeriodId,
            payrollName: value.payrollName,
            componentKey: value.componentKey,
          },
        },
        update: {
          userId: mappingByNormalized.get(value.normalizedPayrollName) || null,
          amount: value.amount,
          sourceSheet: value.sourceSheet,
          sourceCell: value.sourceCell,
          sourceMethod: sourceType,
          isOverride: false,
          provenanceJson: {
            batchId: batch.id,
            periodKey: value.periodKey,
            sourcePriority: value.sourcePriority,
            importedAt: new Date().toISOString(),
          },
        },
        create: {
          periodId: targetPeriodId,
          payrollName: value.payrollName,
          userId: mappingByNormalized.get(value.normalizedPayrollName) || null,
          componentKey: value.componentKey,
          amount: value.amount,
          sourceSheet: value.sourceSheet,
          sourceCell: value.sourceCell,
          sourceMethod: sourceType,
          isOverride: false,
          provenanceJson: {
            batchId: batch.id,
            periodKey: value.periodKey,
            sourcePriority: value.sourcePriority,
            importedAt: new Date().toISOString(),
          },
        },
      })

      importedInputs += 1
    }

    const expensePayload = parsed.expenseEntries
      .map((entry) => {
        const targetPeriodId = periodId || (entry.periodKey ? periodIdByKey.get(entry.periodKey) : undefined)
        if (!targetPeriodId) return null
        return {
          periodId: targetPeriodId,
          payrollName: entry.payrollName || null,
          userId: null,
          categoryKey: entry.categoryKey,
          description: entry.description || null,
          amount: entry.amount,
          sheetName: entry.sheetName,
          rowRef: entry.rowRef,
          enteredById: user.id,
        }
      })
      .filter(Boolean) as Array<{
      periodId: string
      payrollName: string | null
      userId: string | null
      categoryKey: string
      description: string | null
      amount: number
      sheetName: string
      rowRef: string
      enteredById: string
    }>

    if (expensePayload.length > 0) {
      for (const rows of chunk(expensePayload, CHUNK_SIZE)) {
        await prisma.payrollExpenseEntry.createMany({
          data: rows,
        })
      }
    }

    await prisma.payrollImportBatch.update({
      where: { id: batch.id },
      data: {
        status: 'COMPLETED',
        summaryJson: {
          periodId: periodId || null,
          periodKeys: parsed.periodKeys,
          periodsResolved: periodIdByKey.size,
          payrollNames: parsed.payrollNames.length,
          importedRows: parsed.importRows.length,
          importedInputs,
          importedExpenses: expensePayload.length,
          mappingSummary,
          completedAt: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
    })

    return NextResponse.json({
      success: true,
      batchId: batch.id,
      summary: {
        fileName: file.name,
        periodId: periodId || null,
        periodKeys: parsed.periodKeys,
        periodsResolved: periodIdByKey.size,
        importedRows: parsed.importRows.length,
        importedInputs,
        importedExpenses: expensePayload.length,
        mappingSummary,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown import error'
    if (batchId) {
      await prisma.payrollImportBatch.update({
        where: { id: batchId },
        data: {
          status: 'FAILED',
          errorMessage: message,
        },
      })
    }
    console.error('Failed to import payroll workbook:', error)
    return NextResponse.json({ error: 'Failed to import payroll workbook', details: message }, { status: 500 })
  }
}

import { prisma } from '@/lib/db'
import { parsePayrollWorkbook } from '@/lib/payroll/workbook-parser'
import { normalizePayrollName, periodKeyToDate, periodLabelFromKey } from '@/lib/payroll/normalizers'
import { recalculatePayrollPeriod } from '@/lib/payroll/engine'
import { syncPayrollIdentityMappings } from '@/lib/payroll/matching'
import type { Prisma, PayrollPeriodStatus, User } from '@prisma/client'

const CHUNK_SIZE = 500

export interface PayrollBackfillOptions {
  buffer: Buffer
  actorId: string
  fileName?: string
  months?: number
  tolerance?: number
  lockApproved?: boolean
  useEmployeeRosterNames?: boolean
  overwriteLocked?: boolean
  persistImportRows?: boolean
}

export interface PayrollBackfillSummary {
  selectedPeriodKeys: string[]
  skippedLockedPeriodKeys: string[]
  periodsCreated: number
  periodsProcessed: number
  periodsLocked: number
  periodsBlocked: number
  blockedByPeriod: Record<string, string[]>
  importedRows: number
  importedInputs: number
  importedExpenses: number
  mappingSummary: {
    total: number
    autoMatched: number
    ambiguous: number
    unresolved: number
  }
}

interface RosterAlias {
  payrollName: string
  userId: string
}

function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999))
}

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = []
  for (let i = 0; i < items.length; i += size) output.push(items.slice(i, i + size))
  return output
}

function sortedPeriodKeys(periodKeys: string[]): string[] {
  const valid = [...periodKeys].filter((key) => periodKeyToDate(key) !== null)
  return valid.sort((a, b) => {
    const aTime = periodKeyToDate(a)?.getTime() ?? 0
    const bTime = periodKeyToDate(b)?.getTime() ?? 0
    return aTime - bTime
  })
}

export function selectLatestPeriodKeys(periodKeys: string[], months: number): string[] {
  const safeMonths = Math.max(1, Math.min(120, Number.isFinite(months) ? months : 12))
  const uniqueSorted = [...new Set(sortedPeriodKeys(periodKeys))]
  return uniqueSorted.slice(-safeMonths)
}

export function buildRosterAliasMap(
  workbookNames: string[],
  employees: Array<Pick<User, 'id' | 'name'>>
): Map<string, RosterAlias> {
  if (employees.length === 0) {
    throw new Error('No EMPLOYEE users found for roster alias mapping')
  }

  const uniqueWorkbookNames = [...new Set(workbookNames.map((name) => name.trim()).filter(Boolean))]
  const sortedEmployees = [...employees].sort((a, b) => a.name.localeCompare(b.name))
  const aliasMap = new Map<string, RosterAlias>()

  uniqueWorkbookNames.forEach((workbookName, index) => {
    const employee = sortedEmployees[index % sortedEmployees.length]
    aliasMap.set(normalizePayrollName(workbookName), {
      payrollName: employee.name,
      userId: employee.id,
    })
  })

  return aliasMap
}

async function ensurePeriodForKey(periodKey: string, actorId: string, sourceType: 'WORKBOOK' | 'CARRY_FORWARD') {
  const start = periodKeyToDate(periodKey)
  if (!start) return null

  const monthAfter = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
  const existing = await prisma.payrollPeriod.findFirst({
    where: {
      periodStart: {
        gte: start,
        lt: monthAfter,
      },
    },
  })
  if (existing) return { period: existing, created: false }

  const created = await prisma.payrollPeriod.create({
    data: {
      label: periodLabelFromKey(periodKey),
      periodStart: start,
      periodEnd: endOfMonth(start),
      status: 'DRAFT',
      sourceType,
      createdById: actorId,
    },
  })
  return { period: created, created: true }
}

async function upsertRosterMappings(aliasMap: Map<string, RosterAlias>) {
  const now = new Date()
  const uniqueAliases = new Map<string, RosterAlias>()
  for (const alias of aliasMap.values()) {
    const normalized = normalizePayrollName(alias.payrollName)
    if (!uniqueAliases.has(normalized)) {
      uniqueAliases.set(normalized, alias)
    }
  }

  const normalizedKeys = [...uniqueAliases.keys()]
  const existingMappings = await prisma.payrollIdentityMapping.findMany({
    where: { normalizedPayrollName: { in: normalizedKeys } },
    select: {
      id: true,
      normalizedPayrollName: true,
      displayPayrollName: true,
      userId: true,
      status: true,
    },
  })
  const existingByNormalized = new Map(
    existingMappings.map((mapping) => [mapping.normalizedPayrollName, mapping])
  )

  const creates: Array<{
    normalizedPayrollName: string
    displayPayrollName: string
    userId: string
    status: 'MANUAL_MATCHED'
    lastMatchedAt: Date
    notes: string
  }> = []
  const updates: Array<{
    id: string
    displayPayrollName: string
    userId: string
  }> = []

  for (const [normalized, alias] of uniqueAliases.entries()) {
    const existing = existingByNormalized.get(normalized)
    if (!existing) {
      creates.push({
        normalizedPayrollName: normalized,
        displayPayrollName: alias.payrollName,
        userId: alias.userId,
        status: 'MANUAL_MATCHED',
        lastMatchedAt: now,
        notes: 'Backfill roster alias (dummy workbook mode)',
      })
      continue
    }

    const unchanged =
      existing.displayPayrollName === alias.payrollName &&
      existing.userId === alias.userId &&
      existing.status === 'MANUAL_MATCHED'

    if (!unchanged) {
      updates.push({
        id: existing.id,
        displayPayrollName: alias.payrollName,
        userId: alias.userId,
      })
    }
  }

  if (creates.length > 0) {
    for (const rows of chunk(creates, CHUNK_SIZE)) {
      await prisma.payrollIdentityMapping.createMany({ data: rows })
    }
  }

  if (updates.length > 0) {
    for (const row of updates) {
      await prisma.payrollIdentityMapping.update({
        where: { id: row.id },
        data: {
          displayPayrollName: row.displayPayrollName,
          userId: row.userId,
          status: 'MANUAL_MATCHED',
          lastMatchedAt: now,
          notes: 'Backfill roster alias (dummy workbook mode)',
        },
      })
    }
  }
}

export async function runPayrollBackfill(options: PayrollBackfillOptions): Promise<PayrollBackfillSummary> {
  const months = Math.max(1, Math.min(120, options.months ?? 12))
  const tolerance = options.tolerance ?? 1
  const lockApproved = options.lockApproved ?? true
  const useEmployeeRosterNames = options.useEmployeeRosterNames ?? true
  const overwriteLocked = options.overwriteLocked ?? false
  const persistImportRows = options.persistImportRows ?? false

  const parsed = await parsePayrollWorkbook(options.buffer)
  const candidatePeriodKeys = [
    ...new Set([
      ...parsed.inputValues.map((row) => row.periodKey),
      ...parsed.expenseEntries
        .map((row) => row.periodKey)
        .filter((key): key is string => Boolean(key)),
    ]),
  ].filter((key) => periodKeyToDate(key) !== null)
  const orderedCandidateKeys = sortedPeriodKeys(
    candidatePeriodKeys.length > 0 ? candidatePeriodKeys : parsed.periodKeys
  )
  if (orderedCandidateKeys.length === 0) {
    throw new Error('No period keys found in workbook for backfill')
  }

  const employees = useEmployeeRosterNames
    ? await prisma.user.findMany({
        where: { role: 'EMPLOYEE' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : []

  const aliasMap = useEmployeeRosterNames
    ? buildRosterAliasMap(parsed.payrollNames, employees)
    : new Map<string, RosterAlias>()

  if (useEmployeeRosterNames) {
    await upsertRosterMappings(aliasMap)
  }

  const mappingSummary = useEmployeeRosterNames
    ? await (async () => {
        const mappedNames = [
          ...new Set(
            parsed.payrollNames.map(
              (name) => aliasMap.get(normalizePayrollName(name))?.payrollName || name
            )
          ),
        ]
        const mappedRows = await prisma.payrollIdentityMapping.findMany({
          where: {
            normalizedPayrollName: {
              in: mappedNames.map((name) => normalizePayrollName(name)),
            },
          },
          select: { status: true },
        })

        const summary = {
          total: mappedNames.length,
          autoMatched: 0,
          ambiguous: 0,
          unresolved: 0,
        }
        for (const row of mappedRows) {
          if (row.status === 'AUTO_MATCHED' || row.status === 'MANUAL_MATCHED') summary.autoMatched += 1
          if (row.status === 'AMBIGUOUS') summary.ambiguous += 1
          if (row.status === 'UNRESOLVED') summary.unresolved += 1
        }
        summary.unresolved = Math.max(0, summary.total - summary.autoMatched - summary.ambiguous)
        return summary
      })()
    : await syncPayrollIdentityMappings(parsed.payrollNames)

  const periodByKey = new Map<string, { id: string; status: PayrollPeriodStatus }>()
  const skippedLockedPeriodKeys: string[] = []
  const selectedPeriodKeysDesc: string[] = []
  let periodsCreated = 0

  for (let i = orderedCandidateKeys.length - 1; i >= 0 && selectedPeriodKeysDesc.length < months; i--) {
    const periodKey = orderedCandidateKeys[i]
    const resolved = await ensurePeriodForKey(periodKey, options.actorId, 'WORKBOOK')
    if (!resolved) continue

    if (resolved.period.status === 'LOCKED' && !overwriteLocked) {
      skippedLockedPeriodKeys.push(periodKey)
      continue
    }

    if (resolved.created) periodsCreated += 1
    selectedPeriodKeysDesc.push(periodKey)
    periodByKey.set(periodKey, { id: resolved.period.id, status: resolved.period.status })
  }

  const selectedPeriodKeys = [...selectedPeriodKeysDesc].reverse()
  if (selectedPeriodKeys.length === 0) {
    throw new Error('No eligible payroll periods found. Unlock historical periods or enable overwrite.')
  }
  const selectedPeriodKeySet = new Set(selectedPeriodKeys)

  const batch = await prisma.payrollImportBatch.create({
    data: {
      sourceType: 'WORKBOOK',
      fileName: options.fileName || null,
      importedById: options.actorId,
      status: 'PROCESSING',
      summaryJson: {
        mode: 'BACKFILL',
        months,
        selectedPeriodKeys,
        useEmployeeRosterNames,
        persistImportRows,
      } as Prisma.InputJsonValue,
    },
    select: { id: true },
  })
  try {
    if (persistImportRows && parsed.importRows.length > 0) {
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

    const identityMappings = await prisma.payrollIdentityMapping.findMany({
      select: {
        normalizedPayrollName: true,
        status: true,
        userId: true,
      },
    })
    const mappingByNormalized = new Map(
      identityMappings.map((mapping) => [mapping.normalizedPayrollName, mapping])
    )

    const processPeriodIds = selectedPeriodKeys
      .map((key) => periodByKey.get(key)?.id)
      .filter(Boolean) as string[]

    if (processPeriodIds.length > 0) {
      await prisma.$transaction([
        prisma.payrollInputValue.deleteMany({
          where: { periodId: { in: processPeriodIds } },
        }),
        prisma.payrollExpenseEntry.deleteMany({
          where: { periodId: { in: processPeriodIds } },
        }),
        prisma.payrollComputedValue.deleteMany({
          where: { periodId: { in: processPeriodIds } },
        }),
        prisma.payrollReceipt.deleteMany({
          where: { periodId: { in: processPeriodIds } },
        }),
      ])
    }

    const inputMap = new Map<
      string,
      {
        periodId: string
        payrollName: string
        userId: string | null
        componentKey: string
        amount: number
        sourceSheet: string | null
        sourceCell: string | null
        sourceMethod: 'WORKBOOK'
        isOverride: boolean
        provenanceJson: Prisma.InputJsonValue
      }
    >()

    for (const input of parsed.inputValues) {
      if (!selectedPeriodKeySet.has(input.periodKey)) continue
      const periodRef = periodByKey.get(input.periodKey)
      if (!periodRef) continue

      const normalizedRawName = normalizePayrollName(input.payrollName)
      const alias = aliasMap.get(normalizedRawName)
      const payrollName = alias?.payrollName || input.payrollName
      const normalizedPayrollName = normalizePayrollName(payrollName)
      const mapped = mappingByNormalized.get(normalizedPayrollName)
      const userId = alias?.userId || mapped?.userId || null
      const aggregateKey = `${periodRef.id}::${payrollName}::${input.componentKey}`

      const existing = inputMap.get(aggregateKey)
      if (existing) {
        existing.amount += input.amount
      } else {
        inputMap.set(aggregateKey, {
          periodId: periodRef.id,
          payrollName,
          userId,
          componentKey: input.componentKey,
          amount: input.amount,
          sourceSheet: input.sourceSheet || null,
          sourceCell: input.sourceCell || null,
          sourceMethod: 'WORKBOOK',
          isOverride: false,
          provenanceJson: {
            batchId: batch.id,
            periodKey: input.periodKey,
            sourcePriority: input.sourcePriority,
            importedAt: new Date().toISOString(),
            backfill: true,
            aliasMapped: Boolean(alias),
          } as Prisma.InputJsonValue,
        })
      }
    }

    const inputRows = [...inputMap.values()]
    for (const rows of chunk(inputRows, CHUNK_SIZE)) {
      if (rows.length === 0) continue
      await prisma.payrollInputValue.createMany({
        data: rows,
      })
    }

    const expenseRows = parsed.expenseEntries
      .filter((entry) => entry.periodKey && selectedPeriodKeySet.has(entry.periodKey))
      .map((entry) => {
        const periodKey = entry.periodKey || ''
        const periodRef = periodByKey.get(periodKey)
        if (!periodRef) return null

        let payrollName = entry.payrollName || null
        let userId: string | null = null
        if (payrollName) {
          const alias = aliasMap.get(normalizePayrollName(payrollName))
          if (alias) {
            payrollName = alias.payrollName
            userId = alias.userId
          }
        }

        return {
          periodId: periodRef.id,
          payrollName,
          userId,
          categoryKey: entry.categoryKey,
          description: entry.description || null,
          amount: entry.amount,
          sheetName: entry.sheetName,
          rowRef: entry.rowRef,
          enteredById: options.actorId,
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

    if (expenseRows.length > 0) {
      for (const rows of chunk(expenseRows, CHUNK_SIZE)) {
        await prisma.payrollExpenseEntry.createMany({ data: rows })
      }
    }

    let periodsProcessed = 0
    let periodsLocked = 0
    let periodsBlocked = 0
    const blockedByPeriod: Record<string, string[]> = {}

    for (const periodKey of selectedPeriodKeys) {
      const periodRef = periodByKey.get(periodKey)
      if (!periodRef) continue

      const names = await prisma.payrollInputValue.findMany({
        where: { periodId: periodRef.id },
        select: { payrollName: true, userId: true },
        distinct: ['payrollName'],
      })

      const blockedNames = [...new Set(
        names
          .filter((row) => {
            if (row.userId) return false
            const mapped = mappingByNormalized.get(normalizePayrollName(row.payrollName))
            return !mapped || mapped.status === 'UNRESOLVED' || mapped.status === 'AMBIGUOUS'
          })
          .map((row) => row.payrollName)
      )]

      if (blockedNames.length > 0) {
        periodsBlocked += 1
        blockedByPeriod[periodKey] = blockedNames
        await prisma.payrollPeriod.update({
          where: { id: periodRef.id },
          data: {
            status: 'DRAFT',
            summaryJson: {
              periodKey,
              backfill: true,
              blockedMappings: blockedNames,
              blockedCount: blockedNames.length,
            } as Prisma.InputJsonValue,
          },
        })
        continue
      }

      await recalculatePayrollPeriod(periodRef.id, tolerance)
      periodsProcessed += 1

      if (lockApproved) {
        await prisma.$transaction(async (tx) => {
          await tx.payrollPeriod.update({
            where: { id: periodRef.id },
            data: {
              status: 'LOCKED',
              approvedById: options.actorId,
              approvedAt: new Date(),
              lockedAt: new Date(),
            },
          })

          await tx.payrollApprovalEvent.createMany({
            data: [
              {
                periodId: periodRef.id,
                actorId: options.actorId,
                fromStatus: 'CALCULATED',
                toStatus: 'APPROVED',
                comment: 'Automated backfill approval',
              },
              {
                periodId: periodRef.id,
                actorId: options.actorId,
                fromStatus: 'APPROVED',
                toStatus: 'LOCKED',
                comment: 'Automated backfill lock',
              },
            ],
          })
        })
        periodsLocked += 1
      }
    }

    const summary: PayrollBackfillSummary = {
      selectedPeriodKeys,
      skippedLockedPeriodKeys,
      periodsCreated,
      periodsProcessed,
      periodsLocked,
      periodsBlocked,
      blockedByPeriod,
      importedRows: persistImportRows ? parsed.importRows.length : 0,
      importedInputs: inputRows.length,
      importedExpenses: expenseRows.length,
      mappingSummary,
    }

    await prisma.payrollImportBatch.update({
      where: { id: batch.id },
      data: {
        status: 'COMPLETED',
        summaryJson: summary as unknown as Prisma.InputJsonValue,
      },
    })

    return summary
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown backfill failure'
    await prisma.payrollImportBatch.update({
      where: { id: batch.id },
      data: {
        status: 'FAILED',
        errorMessage: message,
      },
    })
    throw error
  }
}

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadEnvConfig } from '@next/env'
import ExcelJS from 'exceljs'

loadEnvConfig(process.cwd())

interface CliOptions {
  workbookPath: string
  apply: boolean
  allowUnmapped: boolean
  aliases: Map<string, string>
}

const HISTORICAL_SHEETS = [
  'Basic Salary',
  'Mobile',
  'Travel',
  'Internal Bonus',
  'Client Bonus',
] as const

function parseCliOptions(argv: string[]): CliOptions {
  const workbookPath = argv.find((argument) => !argument.startsWith('--'))
  if (!workbookPath) {
    throw new Error(
      'Usage: npm run payroll:import-history -- <workbook.xlsx> [--apply] [--allow-unmapped] [--alias="Workbook Name::Compass Name"]'
    )
  }

  const aliases = new Map<string, string>()
  for (const argument of argv) {
    if (!argument.startsWith('--alias=')) continue
    const value = argument.slice('--alias='.length)
    const separator = value.indexOf('::')
    if (separator <= 0 || separator >= value.length - 2) {
      throw new Error(`Invalid alias argument: ${argument}`)
    }
    aliases.set(value.slice(0, separator).trim(), value.slice(separator + 2).trim())
  }

  return {
    workbookPath: path.resolve(workbookPath),
    apply: argv.includes('--apply'),
    allowUnmapped: argv.includes('--allow-unmapped'),
    aliases,
  }
}

async function reconcileWorkbookTotals(buffer: Buffer) {
  const { normalizePayrollName, parseCellNumber, parsePeriodKey } = await import(
    '../lib/payroll/normalizers'
  )
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as any)

  const mismatches: Array<{ sheet: string; periodKey: string; difference: number }> = []
  const missingTotals: string[] = []
  let checks = 0

  for (const sheetName of HISTORICAL_SHEETS) {
    const sheet = workbook.getWorksheet(sheetName)
    if (!sheet) throw new Error(`Required historical payroll sheet is missing: ${sheetName}`)

    let headerRowNumber = 0
    let nameColumn = 0
    for (let rowNumber = 1; rowNumber <= Math.min(8, sheet.rowCount); rowNumber++) {
      for (let column = 1; column <= Math.min(12, sheet.columnCount); column++) {
        const header = normalizePayrollName(sheet.getRow(rowNumber).getCell(column).text || '')
        if (header === 'employee name' || header === 'employee names') {
          headerRowNumber = rowNumber
          nameColumn = column
          break
        }
      }
      if (headerRowNumber) break
    }
    if (!headerRowNumber || !nameColumn) {
      throw new Error(`Could not find the employee-name header in ${sheetName}`)
    }

    const dateColumns = new Map<number, string>()
    const headerRow = sheet.getRow(headerRowNumber)
    for (let column = 1; column <= sheet.columnCount; column++) {
      const periodKey = parsePeriodKey(headerRow.getCell(column).value)
      if (periodKey) dateColumns.set(column, periodKey)
    }

    let totalRowNumber = 0
    for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber++) {
      const label = normalizePayrollName(sheet.getRow(rowNumber).getCell(nameColumn).text || '')
      if (label === 'total' || label === 'totals' || label === 'grand total') {
        totalRowNumber = rowNumber
        break
      }
    }
    if (!totalRowNumber) {
      const lastRow = sheet.lastRow
      const numericTotals = lastRow
        ? [...dateColumns.keys()].filter(
            (column) => parseCellNumber(lastRow.getCell(column).value) !== null
          ).length
        : 0
      if (lastRow && lastRow.number > headerRowNumber + 1 && numericTotals === dateColumns.size) {
        totalRowNumber = lastRow.number
      }
    }
    if (!totalRowNumber) {
      missingTotals.push(sheetName)
      continue
    }

    for (const [column, periodKey] of dateColumns) {
      const expected = parseCellNumber(sheet.getRow(totalRowNumber).getCell(column).value)
      if (expected === null) continue
      let actual = 0
      for (let rowNumber = headerRowNumber + 1; rowNumber < totalRowNumber; rowNumber++) {
        actual += parseCellNumber(sheet.getRow(rowNumber).getCell(column).value) ?? 0
      }
      checks += 1
      const difference = Number((actual - expected).toFixed(2))
      if (Math.abs(difference) > 0.01) mismatches.push({ sheet: sheetName, periodKey, difference })
    }
  }

  return { checks, mismatches, missingTotals }
}

async function main() {
  const options = parseCliOptions(process.argv.slice(2))
  const buffer = await readFile(options.workbookPath)
  const [{ prisma }, { parsePayrollWorkbook }, normalizers, { runPayrollBackfill }] =
    await Promise.all([
      import('../lib/db'),
      import('../lib/payroll/workbook-parser'),
      import('../lib/payroll/normalizers'),
      import('../lib/payroll/backfill'),
    ])
  const { normalizePayrollName, periodKeyToDate } = normalizers
  const parsed = await parsePayrollWorkbook(buffer)
  const reconciliation = await reconcileWorkbookTotals(buffer)
  if (reconciliation.mismatches.length > 0) {
    throw new Error(
      `Workbook total reconciliation failed: ${reconciliation.mismatches.length} mismatches`
    )
  }

  const [users, existingMappings, existingPeriods, actor] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true } }),
    prisma.payrollIdentityMapping.findMany({
      where: {
        normalizedPayrollName: {
          in: parsed.payrollNames.map((name) => normalizePayrollName(name)),
        },
      },
      select: { normalizedPayrollName: true, userId: true, status: true },
    }),
    prisma.payrollPeriod.findMany({
      where: {
        periodStart: {
          in: parsed.periodKeys
            .map((key) => periodKeyToDate(key))
            .filter((date): date is Date => date !== null),
        },
      },
      select: { periodStart: true, status: true },
      orderBy: { periodStart: 'asc' },
    }),
    prisma.user.findFirst({
      where: { role: 'HR' },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])
  if (!actor) throw new Error('No HR user is available to attribute the historical import')

  const usersByNormalized = new Map<string, Array<{ id: string; name: string }>>()
  for (const user of users) {
    const key = normalizePayrollName(user.name)
    usersByNormalized.set(key, [...(usersByNormalized.get(key) ?? []), user])
  }
  const existingByNormalized = new Map(
    existingMappings.map((mapping) => [mapping.normalizedPayrollName, mapping])
  )

  const aliasTargets = new Map<string, { id: string; name: string }>()
  for (const [sourceName, targetName] of options.aliases) {
    const targets = usersByNormalized.get(normalizePayrollName(targetName)) ?? []
    if (targets.length !== 1) {
      throw new Error(`Alias target must match exactly one Compass user: ${targetName}`)
    }
    aliasTargets.set(normalizePayrollName(sourceName), targets[0])
  }

  const unresolved: string[] = []
  const ambiguous: string[] = []
  let resolved = 0
  for (const payrollName of parsed.payrollNames) {
    const normalized = normalizePayrollName(payrollName)
    const exactMatches = usersByNormalized.get(normalized) ?? []
    const existing = existingByNormalized.get(normalized)
    if (aliasTargets.has(normalized) || existing?.userId || exactMatches.length === 1) resolved += 1
    else if (exactMatches.length > 1 || existing?.status === 'AMBIGUOUS') ambiguous.push(payrollName)
    else unresolved.push(payrollName)
  }

  const preview = {
    mode: options.apply ? 'APPLY' : 'DRY_RUN',
    workbook: path.basename(options.workbookPath),
    periodsInWorkbook: parsed.periodKeys.length,
    existingPeriodsPreserved: existingPeriods.map((period) => ({
      month: period.periodStart.toISOString().slice(0, 7),
      status: period.status,
    })),
    newPeriods: parsed.periodKeys.length - existingPeriods.length,
    employeesInWorkbook: parsed.payrollNames.length,
    identities: { resolved, ambiguous, unresolved },
    inputs: parsed.inputValues.length,
    totalChecks: reconciliation.checks,
    sheetsWithoutSourceTotals: reconciliation.missingTotals,
    actor: actor.name,
  }
  console.log(JSON.stringify(preview, null, 2))

  if (!options.apply) {
    await prisma.$disconnect()
    return
  }
  if (ambiguous.length > 0) throw new Error('Ambiguous employee identities must be resolved before import')
  if (unresolved.length > 0 && !options.allowUnmapped) {
    throw new Error('Unresolved employee identities remain; rerun with explicit aliases or --allow-unmapped')
  }

  for (const [normalizedSource, target] of aliasTargets) {
    const sourceName = parsed.payrollNames.find(
      (name) => normalizePayrollName(name) === normalizedSource
    )
    if (!sourceName) throw new Error(`Alias source is not present in the workbook: ${normalizedSource}`)
    await prisma.payrollIdentityMapping.upsert({
      where: { normalizedPayrollName: normalizedSource },
      create: {
        normalizedPayrollName: normalizedSource,
        displayPayrollName: sourceName,
        userId: target.id,
        status: 'MANUAL_MATCHED',
        lastMatchedAt: new Date(),
        notes: `Historical payroll alias to ${target.name}`,
      },
      update: {
        displayPayrollName: sourceName,
        userId: target.id,
        status: 'MANUAL_MATCHED',
        lastMatchedAt: new Date(),
        notes: `Historical payroll alias to ${target.name}`,
      },
    })
  }

  const summary = await runPayrollBackfill({
    buffer,
    actorId: actor.id,
    fileName: path.basename(options.workbookPath),
    months: parsed.periodKeys.length,
    tolerance: 1,
    lockApproved: true,
    useEmployeeRosterNames: false,
    overwriteLocked: false,
    overwriteExisting: false,
    allowUnmapped: options.allowUnmapped,
    persistImportRows: true,
  })
  console.log(JSON.stringify({ imported: true, summary }, null, 2))
  await prisma.$disconnect()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

import ExcelJS from 'exceljs'
import {
  EXPENSE_SHEETS,
  SHEET_PRIORITY,
  SHEET_TO_COMPONENT_KEY,
  isActiveEditableSheet,
  isReadOnlyHistorySheet,
} from '@/lib/payroll/sheet-adapters'
import {
  normalizePayrollName,
  parseCellNumber,
  parsePeriodKey,
  periodKeyFromDate,
  isTruthyString,
} from '@/lib/payroll/normalizers'
import type { PayrollComponentKey } from '@/lib/payroll/config'

export interface ParsedImportRow {
  sheetName: string
  rowNumber: number
  rowJson: Record<string, unknown>
  periodKey?: string
  payrollName?: string
  normalizedName?: string
}

export interface ParsedInputValue {
  periodKey: string
  payrollName: string
  normalizedPayrollName: string
  componentKey: PayrollComponentKey
  amount: number
  sourceSheet: string
  sourceCell: string
  sourcePriority: number
}

export interface ParsedExpenseEntry {
  periodKey?: string
  payrollName?: string
  categoryKey: string
  description?: string
  amount: number
  sheetName: string
  rowRef: string
}

export interface WorkbookParseResult {
  importRows: ParsedImportRow[]
  inputValues: ParsedInputValue[]
  expenseEntries: ParsedExpenseEntry[]
  periodKeys: string[]
  payrollNames: string[]
}

function columnLetter(column: number): string {
  let n = column
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

function toJsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) return null

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonSafe(item))
  }

  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' || typeof value === 'boolean') return value

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>
    const output: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(source)) {
      output[key] = toJsonSafe(nested)
    }
    return output
  }

  return String(value)
}

function toCellPayload(value: unknown) {
  if (typeof value === 'object' && value && 'formula' in value) {
    const formulaObj = value as { formula?: string; result?: unknown }
    return {
      formula: formulaObj.formula || null,
      result: toJsonSafe(formulaObj.result),
    }
  }
  return toJsonSafe(value)
}

function detectDateColumns(worksheet: ExcelJS.Worksheet): Map<number, string> {
  const dateColumns = new Map<number, string>()
  const rowLimit = Math.min(8, worksheet.rowCount)
  const colLimit = Math.max(worksheet.columnCount, 80)

  for (let rowNumber = 1; rowNumber <= rowLimit; rowNumber++) {
    const row = worksheet.getRow(rowNumber)
    for (let col = 1; col <= colLimit; col++) {
      const key = parsePeriodKey(row.getCell(col).value)
      if (key) dateColumns.set(col, key)
    }
  }

  return dateColumns
}

interface NameColumnLocation {
  column: number
  headerRow: number | null
}

const NAME_HEADERS = new Set([
  'employee',
  'employee name',
  'employee names',
  'payroll name',
  'payroll names',
])

const SUMMARY_ROW_NAMES = new Set(['total', 'totals', 'grand total', 'monthly total'])

function detectNameColumn(worksheet: ExcelJS.Worksheet, sheetName: string): NameColumnLocation {
  const rowLimit = Math.min(8, Math.max(worksheet.rowCount, 1))
  const colLimit = Math.min(12, Math.max(worksheet.columnCount, 1))

  for (let rowNumber = 1; rowNumber <= rowLimit; rowNumber++) {
    const row = worksheet.getRow(rowNumber)
    for (let column = 1; column <= colLimit; column++) {
      const header = normalizePayrollName(row.getCell(column).text || '')
      if (NAME_HEADERS.has(header)) return { column, headerRow: rowNumber }
    }
  }

  return {
    column: sheetName === 'Reimbursements (Approved)' ? 4 : 2,
    headerRow: null,
  }
}

function payrollNameFromRow(
  row: ExcelJS.Row,
  rowNumber: number,
  location: NameColumnLocation
): string | undefined {
  if (location.headerRow !== null && rowNumber <= location.headerRow) return undefined

  const payrollName = row.getCell(location.column).text?.trim()
  if (!payrollName) return undefined

  const normalized = normalizePayrollName(payrollName)
  if (!normalized || NAME_HEADERS.has(normalized) || SUMMARY_ROW_NAMES.has(normalized)) {
    return undefined
  }
  return payrollName
}

function dedupeByPriority(values: ParsedInputValue[]): ParsedInputValue[] {
  const byKey = new Map<string, ParsedInputValue>()
  for (const value of values) {
    const k = `${value.periodKey}::${value.normalizedPayrollName}::${value.componentKey}`
    const existing = byKey.get(k)
    if (!existing || value.sourcePriority >= existing.sourcePriority) {
      byKey.set(k, value)
    }
  }
  return [...byKey.values()]
}

const ADDITIVE_BONUS_SHEETS = new Set(['Internal Bonus', 'Client Bonus'])

function mergeInputValues(values: ParsedInputValue[]): ParsedInputValue[] {
  const regular = values.filter((value) => !ADDITIVE_BONUS_SHEETS.has(value.sourceSheet))
  const additive = values.filter((value) => ADDITIVE_BONUS_SHEETS.has(value.sourceSheet))
  const additiveByKey = new Map<string, ParsedInputValue>()

  for (const value of additive) {
    const key = `${value.periodKey}::${value.normalizedPayrollName}::${value.componentKey}`
    const existing = additiveByKey.get(key)
    if (!existing) {
      additiveByKey.set(key, { ...value })
      continue
    }

    existing.amount += value.amount
    if (!existing.sourceSheet.split(' + ').includes(value.sourceSheet)) {
      existing.sourceSheet = `${existing.sourceSheet} + ${value.sourceSheet}`
    }
    existing.sourceCell = `${existing.sourceCell} + ${value.sourceCell}`
    existing.sourcePriority = Math.max(existing.sourcePriority, value.sourcePriority)
  }

  return dedupeByPriority([...regular, ...additiveByKey.values()])
}

function maybeAddExpenseEntry(
  expenseEntries: ParsedExpenseEntry[],
  sheetName: string,
  rowNumber: number,
  rowValues: string[],
  row: ExcelJS.Row
) {
  if (!EXPENSE_SHEETS.has(sheetName)) return

  const amountCandidates = [7, 6, 5, 4, 3, 2].map((c) => ({
    col: c,
    value: parseCellNumber(row.getCell(c).value),
  }))
  const amountHit = amountCandidates.find((c) => c.value !== null)
  if (!amountHit || amountHit.value === null) return

  const periodKey = parsePeriodKey(row.getCell(1).value) || parsePeriodKey(row.getCell(2).value) || undefined
  const payrollName = isTruthyString(row.getCell(4).text)
    ? row.getCell(4).text.trim()
    : isTruthyString(row.getCell(2).text)
      ? row.getCell(2).text.trim()
      : undefined

  const description = rowValues.find((v, idx) => idx > 0 && idx < 6 && v.length > 0)
  expenseEntries.push({
    periodKey,
    payrollName,
    categoryKey: sheetName.toUpperCase().replace(/\s+/g, '_'),
    description: description || undefined,
    amount: amountHit.value,
    sheetName,
    rowRef: `${columnLetter(amountHit.col)}${rowNumber}`,
  })
}

export async function parsePayrollWorkbook(buffer: Buffer): Promise<WorkbookParseResult> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as any)

  const importRows: ParsedImportRow[] = []
  const inputValues: ParsedInputValue[] = []
  const expenseEntries: ParsedExpenseEntry[] = []
  const periodKeys = new Set<string>()
  const payrollNames = new Set<string>()

  for (const worksheet of workbook.worksheets) {
    const sheetName = worksheet.name
    if (!isActiveEditableSheet(sheetName) && !isReadOnlyHistorySheet(sheetName)) {
      continue
    }

    const dateColumns = detectDateColumns(worksheet)
    const nameColumn = detectNameColumn(worksheet, sheetName)
    const componentKey = SHEET_TO_COMPONENT_KEY[sheetName]
    const sourcePriority = SHEET_PRIORITY[sheetName] ?? 50

    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const rowNumber = row.number
      const rowJson: Record<string, unknown> = {}
      const rowValuesForDesc: string[] = []

      row.eachCell({ includeEmpty: false }, (cell, col) => {
        const cellRef = `${columnLetter(col)}${rowNumber}`
        rowJson[cellRef] = toCellPayload(cell.value)
        rowValuesForDesc.push(String(cell.text || '').trim())
      })

      const payrollName = payrollNameFromRow(row, rowNumber, nameColumn)
      const normalizedName = payrollName ? normalizePayrollName(payrollName) : undefined

      if (payrollName) payrollNames.add(payrollName)
      if (normalizedName) {
        importRows.push({
          sheetName,
          rowNumber,
          rowJson,
          payrollName,
          normalizedName,
        })
      } else {
        importRows.push({
          sheetName,
          rowNumber,
          rowJson,
        })
      }

      // Reimbursements (Approved) uses a row-level period key and amount column.
      if (sheetName === 'Reimbursements (Approved)' && payrollName) {
        const periodKey = parsePeriodKey(row.getCell(1).value)
        const amount = parseCellNumber(row.getCell(7).value)
        if (periodKey && amount !== null) {
          periodKeys.add(periodKey)
          inputValues.push({
            periodKey,
            payrollName,
            normalizedPayrollName: normalizePayrollName(payrollName),
            componentKey: 'EXPENSE_REIMBURSEMENT',
            amount,
            sourceSheet: sheetName,
            sourceCell: `G${rowNumber}`,
            sourcePriority,
          })
        }
      }

      // WHT sheet is block-based and stores tax withholding rows in col C.
      if (sheetName === 'WHT Calculations') {
        const label = row.getCell(3).text?.trim().toLowerCase()
        const payrollFromColB = row.getCell(2).text?.trim()
        if (label?.includes('tax withholding') && payrollFromColB) {
          const normalizedPayrollName = normalizePayrollName(payrollFromColB)
          payrollNames.add(payrollFromColB)
          for (const [col, periodKey] of dateColumns.entries()) {
            const amount = parseCellNumber(row.getCell(col).value)
            if (amount === null) continue
            periodKeys.add(periodKey)
            inputValues.push({
              periodKey,
              payrollName: payrollFromColB,
              normalizedPayrollName,
              componentKey: 'INCOME_TAX',
              amount,
              sourceSheet: sheetName,
              sourceCell: `${columnLetter(col)}${rowNumber}`,
              sourcePriority,
            })
          }
        }
      }

      if (componentKey && payrollName) {
        const normalizedPayrollName = normalizePayrollName(payrollName)
        for (const [col, periodKey] of dateColumns.entries()) {
          const amount = parseCellNumber(row.getCell(col).value)
          if (amount === null) continue
          periodKeys.add(periodKey)
          inputValues.push({
            periodKey,
            payrollName,
            normalizedPayrollName,
            componentKey,
            amount,
            sourceSheet: sheetName,
            sourceCell: `${columnLetter(col)}${rowNumber}`,
            sourcePriority,
          })
        }
      }

      maybeAddExpenseEntry(expenseEntries, sheetName, rowNumber, rowValuesForDesc, row)
    })

    // Salary Payments sheet can hold period references in headers that do not appear in rows.
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const periodKey = periodKeyFromDate(cell.value) || parsePeriodKey(cell.value)
        if (periodKey) periodKeys.add(periodKey)
      })
    })
  }

  return {
    importRows,
    inputValues: mergeInputValues(inputValues),
    expenseEntries,
    periodKeys: [...periodKeys].sort(),
    payrollNames: [...payrollNames].sort((a, b) => a.localeCompare(b)),
  }
}

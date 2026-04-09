import ExcelJS from 'exceljs'
import type { SubscriptionImportRow } from '@/lib/subscriptions'
import {
  SUBSCRIPTION_SHEET_NAMES,
  normalizeOptionalSubscriptionText,
} from '@/lib/subscriptions'

function normalizeWorkbookCellValue(value: ExcelJS.CellValue) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text.trim()
    if ('result' in value && value.result !== undefined && value.result !== null) {
      return String(value.result).trim()
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((entry) => entry.text).join('').trim()
    }
  }
  return String(value).trim()
}

function buildWorksheetRows(worksheet: ExcelJS.Worksheet) {
  const headerRow = worksheet.getRow(1)
  const headerValues = Array.isArray(headerRow.values) ? headerRow.values.slice(1) : []
  const headers = headerValues.map((value) => normalizeWorkbookCellValue(value as ExcelJS.CellValue))

  const rows: Record<string, string>[] = []
  for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex++) {
    const row = worksheet.getRow(rowIndex)
    const values = Array.isArray(row.values) ? row.values.slice(1) : []
    const record: Record<string, string> = {}

    headers.forEach((header, index) => {
      if (!header) return
      record[header] = normalizeWorkbookCellValue(values[index] as ExcelJS.CellValue)
    })

    if (Object.values(record).some((value) => value !== '')) {
      rows.push(record)
    }
  }

  return rows
}

function combineNotes(...parts: Array<string | null | undefined>) {
  const normalized = parts
    .map((part) => normalizeOptionalSubscriptionText(part))
    .filter((part): part is string => Boolean(part))

  if (normalized.length === 0) return null
  return [...new Set(normalized)].join('\n\n')
}

function mapActiveRow(row: Record<string, string>): SubscriptionImportRow | null {
  const name = normalizeOptionalSubscriptionText(row.Service)
  if (!name) return null

  const workbookStatus = normalizeOptionalSubscriptionText(row.Status)
  const notes =
    workbookStatus && workbookStatus.toLowerCase() !== 'active'
      ? combineNotes(`Workbook status: ${workbookStatus}`)
      : null

  return {
    name,
    team: normalizeOptionalSubscriptionText(row.Team),
    usersText: normalizeOptionalSubscriptionText(row['Users (email addresses)']),
    paymentMethodText: normalizeOptionalSubscriptionText(row['Payment Method']),
    purpose: normalizeOptionalSubscriptionText(row.Purpose),
    costText: normalizeOptionalSubscriptionText(row.Cost),
    subscriptionTypeText: normalizeOptionalSubscriptionText(row['Subscription Type (Monthly/Yearly)']),
    billedToText: normalizeOptionalSubscriptionText(row['Billed To (Company or Client)']),
    renewalText: normalizeOptionalSubscriptionText(row['Renewal Date']),
    noticePeriodText: normalizeOptionalSubscriptionText(row['Notice Period to Cancel']),
    personInChargeText: normalizeOptionalSubscriptionText(row['Person In Charge']),
    lastPaymentText: null,
    notes,
    sourceSheet: SUBSCRIPTION_SHEET_NAMES.active,
    status: 'ACTIVE',
  }
}

function mapCanceledRow(row: Record<string, string>): SubscriptionImportRow | null {
  const name = normalizeOptionalSubscriptionText(row.Service)
  if (!name) return null

  return {
    name,
    team: normalizeOptionalSubscriptionText(row.Team),
    usersText: normalizeOptionalSubscriptionText(row['Users (email addresses)']),
    paymentMethodText: normalizeOptionalSubscriptionText(row['Payment Method']),
    purpose: normalizeOptionalSubscriptionText(row.Purpose),
    costText: normalizeOptionalSubscriptionText(row.Cost),
    subscriptionTypeText: normalizeOptionalSubscriptionText(row['Subscription Type (Monthly/Yearly)']),
    billedToText: normalizeOptionalSubscriptionText(row['Billed To (Company or Client)']),
    renewalText: normalizeOptionalSubscriptionText(row['Renewal Date']),
    noticePeriodText: null,
    personInChargeText: normalizeOptionalSubscriptionText(row['Person In Charge']),
    lastPaymentText: normalizeOptionalSubscriptionText(row['Last Payment Made on']),
    notes: null,
    sourceSheet: SUBSCRIPTION_SHEET_NAMES.canceled,
    status: 'CANCELED',
  }
}

export async function parseSubscriptionWorkbook(workbookBuffer: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(workbookBuffer)

  const activeSheet = workbook.getWorksheet(SUBSCRIPTION_SHEET_NAMES.active)
  const canceledSheet = workbook.getWorksheet(SUBSCRIPTION_SHEET_NAMES.canceled)

  if (!activeSheet || !canceledSheet) {
    throw new Error(
      `Workbook must include ${SUBSCRIPTION_SHEET_NAMES.active} and ${SUBSCRIPTION_SHEET_NAMES.canceled}`
    )
  }

  const activeRows = buildWorksheetRows(activeSheet)
    .map(mapActiveRow)
    .filter((row): row is SubscriptionImportRow => Boolean(row))

  const canceledRows = buildWorksheetRows(canceledSheet)
    .map(mapCanceledRow)
    .filter((row): row is SubscriptionImportRow => Boolean(row))

  return [...activeRows, ...canceledRows]
}

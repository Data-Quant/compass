import ExcelJS from 'exceljs'
import type { RelationshipType } from '@/types'
import { buildWorkbookProfileDefinition, type WorkbookProfileDefinition } from '@/lib/weight-profiles'
import { resolveImportedName } from '@/lib/mapping-import'
import { WORKBOOK_SHEET_NAMES } from '@/lib/weight-profiles'

export type WorkbookMappingRow = Record<string, string>

const SHEET2_WEIGHT_COLUMNS: Array<{
  header: string
  relationshipType: RelationshipType
}> = [
  { header: 'Dept', relationshipType: 'DEPT' },
  { header: 'Team Lead', relationshipType: 'TEAM_LEAD' },
  { header: 'C suite (Hamiz)', relationshipType: 'C_LEVEL' },
  { header: 'Peer', relationshipType: 'PEER' },
  { header: 'Reporting TMs', relationshipType: 'DIRECT_REPORT' },
  { header: 'HR', relationshipType: 'HR' },
]

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

function normalizeSheetHeader(value: string) {
  return value.trim()
}

function buildWorksheetRows(worksheet: ExcelJS.Worksheet) {
  const headerRow = worksheet.getRow(1)
  const headerValues = Array.isArray(headerRow.values) ? headerRow.values.slice(1) : []
  const headers = headerValues
    .map((value: ExcelJS.CellValue) =>
      normalizeSheetHeader(normalizeWorkbookCellValue(value))
    )

  const rows: WorkbookMappingRow[] = []
  for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex++) {
    const row = worksheet.getRow(rowIndex)
    const values = Array.isArray(row.values) ? row.values.slice(1) : []
    const record: WorkbookMappingRow = {}

    headers.forEach((header: string, index: number) => {
      if (!header) return
      record[header] = normalizeWorkbookCellValue(values[index] as ExcelJS.CellValue)
    })

    if (Object.values(record).some((value) => value !== '')) {
      rows.push(record)
    }
  }

  return rows
}

function parseWorkbookWeight(weight: string) {
  if (!weight || weight === '-' || weight === '–') {
    return 0
  }

  const numeric = Number.parseFloat(weight)
  return Number.isFinite(numeric) ? numeric : 0
}

export function isPeerColumnHeader(header: string) {
  return /^peer\s*\d+$/i.test(header.trim()) || /^team member\/\s*peer\s*\d+$/i.test(header.trim())
}

export function isReportingTeamMemberColumnHeader(header: string) {
  return /^reporting team member\s*\d+$/i.test(header.trim())
}

export function isTeamLeadColumnHeader(header: string) {
  return /^team lead\s*\d+$/i.test(header.trim())
}

export async function parseEvaluationWorkbook(
  workbookBuffer: ArrayBuffer
): Promise<{
  mappingRows: WorkbookMappingRow[]
  profileDefinitions: WorkbookProfileDefinition[]
}> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(workbookBuffer)

  const mappingSheet = workbook.getWorksheet(WORKBOOK_SHEET_NAMES.mappings)
  const profileSheet = workbook.getWorksheet(WORKBOOK_SHEET_NAMES.profiles)

  if (!mappingSheet || !profileSheet) {
    throw new Error(
      `Workbook must include ${WORKBOOK_SHEET_NAMES.mappings} and ${WORKBOOK_SHEET_NAMES.profiles}`
    )
  }

  const mappingRows = buildWorksheetRows(mappingSheet)
    .filter((row) => row.Name && row.Name.trim() !== '')
    .map((row) => ({
      ...row,
      Name: resolveImportedName(row.Name),
    }))

  const candidateNames = mappingRows.map((row) => row.Name)

  const profileRows = buildWorksheetRows(profileSheet)
    .filter((row) => row.Profile && row.Profile.trim() !== '')
    .map((row) =>
      buildWorkbookProfileDefinition({
        profileName: row.Profile,
        weightRows: SHEET2_WEIGHT_COLUMNS.map((column) => ({
          relationshipType: column.relationshipType,
          weight: parseWorkbookWeight(row[column.header] || ''),
        })),
        memberBlob: row.Members || '',
        candidateNames,
      })
    )

  return {
    mappingRows,
    profileDefinitions: profileRows,
  }
}

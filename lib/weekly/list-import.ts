// Reading a round's lists from a spreadsheet (UX spec, HR step 2). The columns are the mapping workbook's: Name, then
// "Team Lead 1…", "Peer 1…" and "Reporting Team Member 1…". A .csv or the first sheet of an .xlsx is read.
import ExcelJS from 'exceljs'
import { buildWorksheetRows, isPeerColumnHeader, isReportingTeamMemberColumnHeader, isTeamLeadColumnHeader, type WorkbookMappingRow } from '@/lib/workbook-import'

export const MAX_LIST_FILE_BYTES = 2 * 1024 * 1024
/** An .xlsx is a zip: refuse one that would unpack to more than this, before anything is inflated. */
export const MAX_UNPACKED_BYTES = 20 * 1024 * 1024

export interface ListRow { name: string; leads: string[]; peers: string[]; reports: string[] }
/** Which list columns the file has: a list with no column in the file is left as it is. */
export interface ListColumns { leads: boolean; peers: boolean; reports: boolean }
export interface ListFile { rows: ListRow[]; columns: ListColumns }

/**
 * The total unpacked size a zip declares in its central directory; Infinity when it cannot be read or uses ZIP64
 * (far beyond any list). Decompressing libraries trust these sizes less than we need, so this is checked first.
 */
export function declaredUnpackedSize(bytes: ArrayBuffer): number {
  const view = new DataView(bytes)
  const EOCD = 0x06054b50
  const CENTRAL = 0x02014b50
  let end = -1
  for (let i = bytes.byteLength - 22; i >= Math.max(0, bytes.byteLength - 22 - 65535); i -= 1) {
    if (view.getUint32(i, true) === EOCD) { end = i; break }
  }
  if (end < 0) return Infinity
  const entries = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true)
  let total = 0
  for (let n = 0; n < entries; n += 1) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== CENTRAL) return Infinity
    const size = view.getUint32(offset + 24, true)
    if (size === 0xffffffff) return Infinity
    total += size
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
  }
  return total
}

/** Splits CSV text into rows of cells: commas, quoted cells with "" for a quote, and CRLF or LF line ends. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1 } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

function csvRecords(text: string): WorkbookMappingRow[] {
  const [header = [], ...body] = parseCsv(text.replace(/^﻿/, ''))
  const headers = header.map((h) => h.trim())
  return body.map((cells) => Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? '').trim()]).filter(([h]) => h)))
}

async function xlsxRecords(bytes: ArrayBuffer): Promise<WorkbookMappingRow[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes)
  const sheet = workbook.worksheets[0]
  return sheet ? buildWorksheetRows(sheet) : []
}

/** The rows of a lists file and the list columns it has, or a message saying why it cannot be read. */
export async function readListFile(file: { name: string; bytes: ArrayBuffer }): Promise<ListFile | string> {
  if (file.bytes.byteLength > MAX_LIST_FILE_BYTES) return 'The file is larger than 2 MB'
  const lower = file.name.toLowerCase()
  let records: WorkbookMappingRow[]
  try {
    if (lower.endsWith('.csv')) records = csvRecords(new TextDecoder().decode(file.bytes))
    else if (lower.endsWith('.xlsx')) {
      if (declaredUnpackedSize(file.bytes) > MAX_UNPACKED_BYTES) return 'The file is too large once unpacked'
      records = await xlsxRecords(file.bytes)
    }
    else return 'Upload a .csv or .xlsx file'
  } catch {
    return 'The file could not be read'
  }
  const nameKey = (r: WorkbookMappingRow) => Object.keys(r).find((k) => k.trim().toLowerCase() === 'name')
  if (records.length === 0 || !records.some(nameKey)) return 'The first row needs a Name column, then Team Lead 1, Peer 1, Reporting Team Member 1 and so on'
  const values = (r: WorkbookMappingRow, match: (header: string) => boolean) => Object.entries(r).filter(([h, v]) => match(h) && v.trim()).map(([, v]) => v.trim())
  const headers = new Set(records.flatMap((r) => Object.keys(r)))
  const has = (match: (header: string) => boolean) => [...headers].some(match)
  const rows = records.flatMap((r) => {
    const key = nameKey(r)
    const name = key ? r[key].trim() : ''
    return name ? [{ name, leads: values(r, isTeamLeadColumnHeader), peers: values(r, isPeerColumnHeader), reports: values(r, isReportingTeamMemberColumnHeader) }] : []
  })
  return { rows, columns: { leads: has(isTeamLeadColumnHeader), peers: has(isPeerColumnHeader), reports: has(isReportingTeamMemberColumnHeader) } }
}

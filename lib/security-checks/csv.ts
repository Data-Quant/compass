// CSV building with spreadsheet formula-injection protection.
const FORMULA_START = /^[=+\-@\t\r]/

export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (FORMULA_START.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(header: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number | boolean | null | undefined>>): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}

import { PAYROLL_DEFAULT_TIMEZONE } from '@/lib/payroll/config'

const MIN_PERIOD_YEAR = 2015
const MAX_PERIOD_YEAR = 2100

function isValidPeriodYear(year: number): boolean {
  return year >= MIN_PERIOD_YEAR && year <= MAX_PERIOD_YEAR
}

export function normalizePayrollName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function parseCellNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'object' && value && 'result' in value) {
    const result = (value as { result?: unknown }).result
    if (typeof result === 'number' && Number.isFinite(result)) return result
    if (typeof result === 'string') return parseCellNumber(result)
  }

  if (typeof value === 'string') {
    const sanitized = value.replace(/[^\d.-]/g, '')
    if (!sanitized) return null
    const parsed = Number(sanitized)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function dateFromUnknown(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string') {
    const maybeDate = new Date(value)
    if (!Number.isNaN(maybeDate.getTime())) return maybeDate
  }
  if (typeof value === 'object' && value && 'result' in value) {
    return dateFromUnknown((value as { result?: unknown }).result)
  }
  return null
}

export function toPeriodKey(date: Date, timezone = PAYROLL_DEFAULT_TIMEZONE): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const year = parts.find((p) => p.type === 'year')?.value || ''
  const month = parts.find((p) => p.type === 'month')?.value || ''
  return `${month}/${year}`
}

export function parsePeriodKey(value: unknown): string | null {
  const asDate = dateFromUnknown(value)
  if (asDate) {
    const year = asDate.getUTCFullYear()
    if (!isValidPeriodYear(year)) return null
    return toPeriodKey(asDate)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    const match = trimmed.match(/^(\d{1,2})\s*[/\-]\s*(\d{4})$/)
    if (!match) return null
    const month = String(Number(match[1])).padStart(2, '0')
    const year = Number(match[2])
    if (!isValidPeriodYear(year)) return null
    const yearText = String(year)
    return `${month}/${yearText}`
  }

  return null
}

export function periodKeyToDate(periodKey: string): Date | null {
  const match = periodKey.match(/^(\d{2})\/(\d{4})$/)
  if (!match) return null
  const month = Number(match[1])
  const year = Number(match[2])
  if (month < 1 || month > 12) return null
  if (!isValidPeriodYear(year)) return null
  return new Date(Date.UTC(year, month - 1, 1))
}

export function periodLabelFromKey(periodKey: string): string {
  return `Payroll ${periodKey}`
}

export function periodKeyFromDate(value: unknown): string | null {
  const asDate = dateFromUnknown(value)
  if (!asDate) return null
  if (!isValidPeriodYear(asDate.getUTCFullYear())) return null
  return toPeriodKey(asDate)
}

export function isTruthyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

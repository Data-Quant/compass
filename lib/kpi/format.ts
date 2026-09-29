import {
  formatCalendarDate, formatMonthKey, formatQuarterKey, karachiCalendarDate, monthKeyOf, parseMonthKey, parseQuarterKey, quarterOf,
  type QuarterKey,
} from './calendar'
import type { EvidenceTypeValue, KpiStatusValue } from './view-types'

export const STATUS_LABELS: Record<KpiStatusValue, string> = {
  DRAFT: 'Draft',
  LOCKED: 'Locked',
  CLAIMED_DONE: 'Claimed done',
  NOT_DONE: 'Not done',
  NEEDS_INFO: 'Needs info',
  REJECTED: 'Rejected',
  APPEALED: 'Appealed',
  VERIFIED: 'Verified',
  NOT_VERIFIED: 'Not verified',
  CANCELLED: 'Cancelled',
}

export const EVIDENCE_LABELS: Record<EvidenceTypeValue, string> = {
  LINK: 'Link',
  DOCUMENT: 'Document',
  NUMBER: 'Number',
  CLIENT_CONFIRMATION: 'Client confirmation',
}

const KARACHI_DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', weekday: 'short', day: 'numeric', month: 'short' })
const MONTH_LABEL = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' })

export function formatKarachiDate(iso: string): string {
  return KARACHI_DAY.format(new Date(iso)).replace(',', '')
}

export function karachiDateInputValue(iso: string): string {
  return formatCalendarDate(karachiCalendarDate(new Date(iso)))
}

export function formatPercent(value: number | null): string {
  return value === null ? 'No KPI result' : `${value.toFixed(1)}%`
}

export function monthLabel(monthKey: string): string {
  const key = parseMonthKey(monthKey)
  return key ? MONTH_LABEL.format(new Date(Date.UTC(key.year, key.month - 1, 1))) : monthKey
}

export function quarterLabel(quarterKey: string): string {
  const key = parseQuarterKey(quarterKey)
  return key ? `Q${key.quarter} ${key.year}` : quarterKey
}

export function shiftMonth(monthKey: string, delta: number): string {
  const key = parseMonthKey(monthKey)
  if (!key) return monthKey
  const index = key.year * 12 + key.month - 1 + delta
  return formatMonthKey({ year: Math.floor(index / 12), month: (index % 12) + 1 })
}

export function shiftQuarter(quarterKey: string, delta: number): string {
  const key = parseQuarterKey(quarterKey)
  if (!key) return quarterKey
  const index = key.year * 4 + key.quarter - 1 + delta
  return formatQuarterKey({ year: Math.floor(index / 4), quarter: ((index % 4) + 1) as QuarterKey['quarter'] })
}

export function currentMonthKey(now: Date = new Date()): string {
  return formatMonthKey(monthKeyOf(now))
}

export function currentQuarterKey(now: Date = new Date()): string {
  return formatQuarterKey(quarterOf(monthKeyOf(now)))
}

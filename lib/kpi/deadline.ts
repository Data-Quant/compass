// Each KPI's own deadline (the leads' sheet): due by default at the end of its month, and "late" when the done claim
// came after the deadline day, Karachi time. The month's claim and verification dates stay the hard cut-offs.
import { endOfKarachiDay, formatCalendarDate, karachiCalendarDate, lastDayOfMonth, parseCalendarDate, type MonthKey } from './calendar'
import { KpiError } from './service/errors'
import type { KpiStatusValue } from './view-types'

export interface KpiDeadlineView { dueDate: string; completedAt: string | null; late: boolean }

/** Statuses that follow a done claim; a not-done, cancelled or unclaimed KPI has no completed date. */
const COMPLETED: ReadonlySet<KpiStatusValue> = new Set(['CLAIMED_DONE', 'NEEDS_INFO', 'REJECTED', 'APPEALED', 'VERIFIED', 'NOT_VERIFIED'])
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const monthEndDeadline = (month: MonthKey): Date => endOfKarachiDay(lastDayOfMonth(month))

export function kpiDeadline(kpi: { dueDate: Date | null; claimedAt: Date | null; status: KpiStatusValue }, month: MonthKey): KpiDeadlineView {
  const due = kpi.dueDate ?? monthEndDeadline(month)
  const completed = kpi.claimedAt && COMPLETED.has(kpi.status) ? kpi.claimedAt : null
  return {
    dueDate: formatCalendarDate(karachiCalendarDate(due)),
    completedAt: completed ? formatCalendarDate(karachiCalendarDate(completed)) : null,
    late: completed !== null && completed > due,
  }
}

/** A YYYY-MM-DD day inside the KPI's month, stored as the end of that day in Karachi; none means the month's end. */
export function parseDueDate(value: string | undefined, month: MonthKey): Date {
  if (value === undefined) return monthEndDeadline(month)
  const date = parseCalendarDate(value)
  if (!date) throw new KpiError('Use a real date (YYYY-MM-DD) for the deadline')
  if (date.year !== month.year || date.month !== month.month) {
    throw new KpiError(`The deadline must fall in ${MONTH_NAMES[month.month - 1]} ${month.year}`)
  }
  return endOfKarachiDay(date)
}

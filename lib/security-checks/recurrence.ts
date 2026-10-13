// §3/§14 Frequency and recurrence anchors.
// Fixed calendar → cycle n opens at firstOpenAt + (n-1) × interval.
// Relative       → next cycle opens one interval after the previous cycle's
//                  *scheduled* close (an early close never shifts it).
import { addDays, addMonths, endOfDayAfter } from './dates'
import { GRACE_DAYS, scheduledCloseOf } from './timeline'
import type { Frequency, RecurrenceAnchor } from './types'

const INTERVAL_MONTHS: Readonly<Record<Frequency, number | null>> = {
  ONE_TIME: null,
  QUARTERLY: 3,
  EVERY_4_MONTHS: 4,
  EVERY_6_MONTHS: 6,
  ANNUALLY: 12,
}

export const FREQUENCY_LABELS: Readonly<Record<Frequency, string>> = {
  ONE_TIME: 'One-time',
  QUARTERLY: 'Quarterly',
  EVERY_4_MONTHS: 'Every 4 months',
  EVERY_6_MONTHS: 'Every 6 months',
  ANNUALLY: 'Annually',
}

export function intervalMonths(frequency: Frequency): number | null {
  return INTERVAL_MONTHS[frequency]
}

export interface CycleDates {
  openAt: Date
  deadline: Date
  scheduledCloseAt: Date
}

/** Deadline is the end of the Karachi day `deadlineDays` after the open date. */
export function cycleDatesFor(openAt: Date, deadlineDays: number): CycleDates {
  const deadline = endOfDayAfter(openAt, deadlineDays)
  return { openAt, deadline, scheduledCloseAt: scheduledCloseOf(deadline) }
}

export interface NextCycleInput {
  frequency: Frequency
  anchor: RecurrenceAnchor
  firstOpenAt: Date
  /** Number of the cycle to schedule (1 for the first). */
  cycleNumber: number
  previousScheduledCloseAt: Date | null
}

/** Open date of the given cycle, or null when the campaign schedules no such cycle. */
export function openAtForCycle(input: NextCycleInput): Date | null {
  if (input.cycleNumber === 1) return input.firstOpenAt
  const months = intervalMonths(input.frequency)
  if (months === null) return null
  if (input.anchor === 'FIXED_CALENDAR') return addMonths(input.firstOpenAt, months * (input.cycleNumber - 1))
  if (!input.previousScheduledCloseAt) return null
  return addMonths(input.previousScheduledCloseAt, months)
}

/**
 * A cycle (deadline + 7-day grace) must end before the next one opens, so
 * a campaign never has two open cycles. Returns an error message or null.
 */
export function cycleLengthError(frequency: Frequency, anchor: RecurrenceAnchor, deadlineDays: number): string | null {
  const months = intervalMonths(frequency)
  if (months === null || anchor === 'RELATIVE_TO_CLOSE') return null
  const probe = new Date(Date.UTC(2026, 1, 1))
  const nextOpen = addMonths(probe, months)
  const close = addDays(endOfDayAfter(probe, deadlineDays), GRACE_DAYS)
  return close.getTime() < nextOpen.getTime()
    ? null
    : `The deadline is too long for this frequency: each cycle (deadline + ${GRACE_DAYS}-day grace) must end before the next opens`
}

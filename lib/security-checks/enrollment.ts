// §10 New joiners and leavers.
// New joiner: enrolled with a fresh deadline capped at the cycle's scheduled
// close. If fewer than 7 days remain, recurring campaigns enrol them in the
// next cycle instead; one-time campaigns (no next cycle) enrol them with an
// individual deadline 14 days from enrollment, flagged "late enrollment".
import { DAY_MS, endOfDayAfter } from './dates'
import type { Frequency } from './types'

export const NEW_JOINER_MIN_DAYS = 7
export const ONE_TIME_LATE_DEADLINE_DAYS = 14

export interface JoinerCycle {
  deadline: Date
  scheduledCloseAt: Date
}

export type EnrollmentPlan =
  | { action: 'ENROLL'; deadline: Date; lateEnrollment: boolean }
  | { action: 'NEXT_CYCLE' }

export function planNewJoiner(cycle: JoinerCycle, frequency: Frequency, deadlineDays: number, now: Date): EnrollmentPlan {
  const remainingMs = cycle.scheduledCloseAt.getTime() - now.getTime()
  if (remainingMs < NEW_JOINER_MIN_DAYS * DAY_MS) {
    if (frequency !== 'ONE_TIME') return { action: 'NEXT_CYCLE' }
    return { action: 'ENROLL', deadline: endOfDayAfter(now, ONE_TIME_LATE_DEADLINE_DAYS), lateEnrollment: true }
  }
  const fresh = endOfDayAfter(now, deadlineDays)
  const deadline = fresh.getTime() < cycle.scheduledCloseAt.getTime() ? fresh : cycle.scheduledCloseAt
  return { action: 'ENROLL', deadline, lateEnrollment: true }
}

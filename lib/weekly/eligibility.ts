import { isThreeEDepartment } from '../company-branding'
import { shouldReceiveConstantEvaluations } from '../evaluation-profile-rules'
import { isHrFilledPartner } from './partners'

export interface PersonFacts {
  id: string
  name: string
  department: string | null
  position: string | null
  payrollActive: boolean
  exitDate: Date | null
  joiningDate: Date | null
}

export type ExclusionReason = 'NOT_EVALUATED' | 'FILLED_BY_HR' | 'INACTIVE' | 'LEFT' | 'JOINED_LATE'

export const EXCLUSION_LABELS: Record<ExclusionReason, string> = {
  NOT_EVALUATED: 'Not evaluated (named leader or Partner)',
  FILLED_BY_HR: 'Partner: HR fills in their evaluations',
  INACTIVE: 'No longer active',
  LEFT: 'Has left',
  JOINED_LATE: 'Joined after the round opened',
}

function leftReason(person: PersonFacts, now: Date): ExclusionReason | null {
  if (!person.payrollActive) return 'INACTIVE'
  if (person.exitDate && person.exitDate <= now) return 'LEFT'
  return null
}

/** 3E is not part of the PE redesign: its people are never asked about, never asked, and never listed. */
export function isOutsideRedesign(person: Pick<PersonFacts, 'department'>): boolean {
  return isThreeEDepartment(person.department)
}

/** UX spec, section 7: anyone whose joining date is after the round opens is left out of it, unless HR opts them in. */
export function joinedAfterOpen(person: Pick<PersonFacts, 'joiningDate'>, ctx: { opensAt: Date; optedIn: boolean }): boolean {
  return !ctx.optedIn && person.joiningDate !== null && person.joiningDate > ctx.opensAt
}

/** Who answers questions. With the round's `ctx`, a joiner after it opened answers none (section 7). */
export function evaluatorExclusion(person: PersonFacts, now: Date, ctx?: { opensAt: Date; optedIn: boolean }): ExclusionReason | null {
  if (isOutsideRedesign(person)) return 'NOT_EVALUATED'
  // Their evaluations are filled in by HR at the end of the quarter, so they get no weekly questions.
  if (isHrFilledPartner(person.name)) return 'FILLED_BY_HR'
  const left = leftReason(person, now)
  if (left) return left
  return ctx && joinedAfterOpen(person, ctx) ? 'JOINED_LATE' : null
}

export function evaluateeExclusion(
  person: PersonFacts,
  ctx: { now: Date; opensAt: Date; optedIn: boolean },
): ExclusionReason | null {
  if (!shouldReceiveConstantEvaluations(person)) return 'NOT_EVALUATED'
  const left = leftReason(person, ctx.now)
  if (left) return left
  if (joinedAfterOpen(person, ctx)) return 'JOINED_LATE'
  return null
}

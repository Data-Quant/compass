import { isThreeEDepartment } from '../company-branding'
import { shouldReceiveConstantEvaluations } from '../evaluation-profile-rules'
import { joinedTooLate } from './calendar'
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
  JOINED_LATE: 'Joined with fewer than 6 weeks left',
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

export function evaluatorExclusion(person: PersonFacts, now: Date): ExclusionReason | null {
  if (isOutsideRedesign(person)) return 'NOT_EVALUATED'
  // Their evaluations are filled in by HR at the end of the quarter, so they get no weekly questions.
  if (isHrFilledPartner(person.name)) return 'FILLED_BY_HR'
  return leftReason(person, now)
}

export function evaluateeExclusion(
  person: PersonFacts,
  ctx: { now: Date; weekOneStartsOn: Date; totalWeeks: number; optedIn: boolean },
): ExclusionReason | null {
  if (!shouldReceiveConstantEvaluations(person)) return 'NOT_EVALUATED'
  const left = leftReason(person, ctx.now)
  if (left) return left
  if (!ctx.optedIn && joinedTooLate(person.joiningDate, ctx.weekOneStartsOn, ctx.totalWeeks)) return 'JOINED_LATE'
  return null
}

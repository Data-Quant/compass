// §6 Allowed task transitions. Anything not listed is rejected server-side.
import { FINAL_TASK_STATUSES, TASK_STATUSES, type TaskStatus } from './types'

export type TransitionTrigger =
  | 'SAVE_DRAFT'
  | 'SUBMIT'
  | 'VERIFY'
  | 'RETURN'
  | 'RESUBMIT'
  | 'EXPIRE_NO_SUBMISSION'
  | 'EXPIRE_WINDOW_LAPSED'
  | 'EXPIRE_REVIEW'
  | 'REOPEN'
  | 'EXEMPT'
  | 'EXEMPT_EXPIRED'
  | 'NOT_APPLICABLE'
  | 'CANCEL'

interface Rule {
  from: readonly TaskStatus[]
  to: readonly TaskStatus[]
  trigger: TransitionTrigger
}

const NON_FINAL: readonly TaskStatus[] = TASK_STATUSES.filter((status) => !FINAL_TASK_STATUSES.includes(status))
const AWAITING: readonly TaskStatus[] = ['NOT_STARTED', 'IN_PROGRESS']
const RETURNED: readonly TaskStatus[] = ['REJECTED', 'REQUIRES_INFO']

const RULES: readonly Rule[] = [
  { from: ['NOT_STARTED'], to: ['IN_PROGRESS'], trigger: 'SAVE_DRAFT' },
  { from: AWAITING, to: ['PENDING_REVIEW'], trigger: 'SUBMIT' },
  { from: ['PENDING_REVIEW'], to: ['VERIFIED'], trigger: 'VERIFY' },
  { from: ['PENDING_REVIEW'], to: RETURNED, trigger: 'RETURN' },
  { from: RETURNED, to: ['PENDING_REVIEW'], trigger: 'RESUBMIT' },
  { from: AWAITING, to: ['EXPIRED'], trigger: 'EXPIRE_NO_SUBMISSION' },
  { from: RETURNED, to: ['EXPIRED'], trigger: 'EXPIRE_WINDOW_LAPSED' },
  { from: ['PENDING_REVIEW'], to: ['EXPIRED'], trigger: 'EXPIRE_REVIEW' },
  { from: ['VERIFIED'], to: ['PENDING_REVIEW'], trigger: 'REOPEN' },
  { from: NON_FINAL, to: ['EXEMPT'], trigger: 'EXEMPT' },
  { from: ['EXPIRED'], to: ['EXEMPT'], trigger: 'EXEMPT_EXPIRED' },
  { from: NON_FINAL, to: ['NOT_APPLICABLE'], trigger: 'NOT_APPLICABLE' },
  { from: NON_FINAL, to: ['CANCELLED'], trigger: 'CANCEL' },
]

export function isAllowedTransition(from: TaskStatus, to: TaskStatus, trigger: TransitionTrigger): boolean {
  return RULES.some((rule) => rule.trigger === trigger && rule.from.includes(from) && rule.to.includes(to))
}

/** Returns an error message when the transition is not allowed, otherwise null. */
export function transitionError(from: TaskStatus, to: TaskStatus, trigger: TransitionTrigger): string | null {
  return isAllowedTransition(from, to, trigger) ? null : `A task cannot move from ${from} to ${to} (${trigger})`
}

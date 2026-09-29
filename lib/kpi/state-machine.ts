import type { KpiStatusValue } from './view-types'

export const FINAL_STATUSES: readonly KpiStatusValue[] = ['NOT_DONE', 'VERIFIED', 'NOT_VERIFIED', 'CANCELLED']
const OPEN_AFTER_LOCK: readonly KpiStatusValue[] = ['LOCKED', 'CLAIMED_DONE', 'NEEDS_INFO', 'REJECTED', 'APPEALED']

export interface MonthDeadlinesLike { goalsLockAt: Date; claimsDueAt: Date; responseDueAt: Date }
export interface KpiStateLike { status: KpiStatusValue; appealUsedAt: Date | null; decidedById: string | null }

export type KpiAction =
  | { type: 'EDIT' }
  | { type: 'DISCARD' }
  | { type: 'LOCK' }
  | { type: 'CLAIM_DONE' }
  | { type: 'CLAIM_NOT_DONE' }
  | { type: 'REVISE_CLAIM' }
  | { type: 'DECIDE'; decision: 'VERIFIED' | 'NEEDS_INFO' | 'REJECTED' }
  | { type: 'RESPOND' }
  | { type: 'APPEAL' }
  | { type: 'FINAL_DECISION'; decision: 'VERIFIED' | 'NOT_VERIFIED' }
  | { type: 'APPROVE_CANCEL' }
  | { type: 'APPROVE_EDIT' }
  | { type: 'HR_OVERRIDE'; to: KpiStatusValue }

export type TransitionResult = { ok: true; to: KpiStatusValue } | { ok: false; error: string }
export type SystemReason = 'GOALS_LOCK' | 'CLAIMS_DEADLINE' | 'RESPONSE_DEADLINE'
export interface SystemTransition { from: KpiStatusValue; to: KpiStatusValue; reason: SystemReason }

export function isFinalStatus(status: KpiStatusValue): boolean {
  return FINAL_STATUSES.includes(status)
}

const CLAIMS_CLOSED = 'The claims deadline has passed'
const RESPONSES_CLOSED = 'The response deadline has passed'

const fail = (error: string): TransitionResult => ({ ok: false, error })
const to = (status: KpiStatusValue): TransitionResult => ({ ok: true, to: status })

/** Pass the effective status: callers persist pending system transitions first. */
export function transition(state: KpiStateLike, action: KpiAction, month: MonthDeadlinesLike, now: Date): TransitionResult {
  const status = state.status
  switch (action.type) {
    case 'EDIT':
    case 'DISCARD':
      if (status !== 'DRAFT') return fail('Only draft KPIs can be changed directly; request a change instead')
      if (now > month.goalsLockAt) return fail('KPIs for this month are locked')
      return to(action.type === 'EDIT' ? 'DRAFT' : 'CANCELLED')
    case 'LOCK':
      if (status !== 'DRAFT') return fail('Only draft KPIs can be locked')
      if (now <= month.goalsLockAt) return fail('KPIs lock after the month’s lock date')
      return to('LOCKED')
    // Deadlines are checked first: once one has passed, the status has already moved on, and naming the deadline is the clear message.
    case 'CLAIM_DONE':
    case 'CLAIM_NOT_DONE':
      if (now > month.claimsDueAt) return fail(CLAIMS_CLOSED)
      if (status !== 'LOCKED') return fail('This KPI cannot be claimed in its current state')
      return to(action.type === 'CLAIM_DONE' ? 'CLAIMED_DONE' : 'NOT_DONE')
    case 'REVISE_CLAIM':
      if (now > month.claimsDueAt) return fail(CLAIMS_CLOSED)
      if (status !== 'CLAIMED_DONE' || state.decidedById) return fail('This claim can no longer be revised')
      return to('CLAIMED_DONE')
    case 'DECIDE':
      if (status !== 'CLAIMED_DONE') return fail('Only submitted claims can be decided')
      // After the response deadline the claimer could not answer, so asking for more would end the claim unheard.
      if (action.decision === 'NEEDS_INFO' && now > month.responseDueAt) {
        return fail('The response deadline has passed, so the claimer can no longer reply. Verify or reject instead.')
      }
      return to(action.decision)
    case 'RESPOND':
      if (now > month.responseDueAt) return fail(RESPONSES_CLOSED)
      if (status !== 'NEEDS_INFO') return fail('No information was requested for this KPI')
      return to('CLAIMED_DONE')
    case 'APPEAL':
      if (state.appealUsedAt) return fail('This claim has already been appealed')
      if (now > month.responseDueAt) return fail(RESPONSES_CLOSED)
      if (status !== 'REJECTED') return fail('Only rejected claims can be appealed')
      return to('APPEALED')
    case 'FINAL_DECISION':
      if (status !== 'APPEALED') return fail('Only appealed claims get a final decision')
      return to(action.decision)
    case 'APPROVE_CANCEL':
    case 'APPROVE_EDIT':
      if (!OPEN_AFTER_LOCK.includes(status)) return fail('Only locked, unfinished KPIs can be changed by request')
      return to(action.type === 'APPROVE_CANCEL' ? 'CANCELLED' : status)
    case 'HR_OVERRIDE':
      if (!isFinalStatus(status)) return fail('Only final results can be overridden')
      if (!isFinalStatus(action.to) || action.to === status) return fail('Choose a different final result')
      return to(action.to)
    default: {
      const unreachable: never = action
      return fail(`Unknown action ${JSON.stringify(unreachable)}`)
    }
  }
}

export function pendingSystemTransitions(status: KpiStatusValue, month: MonthDeadlinesLike, now: Date): SystemTransition[] {
  const steps: SystemTransition[] = []
  let current = status
  if (current === 'DRAFT' && now > month.goalsLockAt) {
    steps.push({ from: 'DRAFT', to: 'LOCKED', reason: 'GOALS_LOCK' })
    current = 'LOCKED'
  }
  if (current === 'LOCKED' && now > month.claimsDueAt) {
    steps.push({ from: 'LOCKED', to: 'NOT_DONE', reason: 'CLAIMS_DEADLINE' })
    current = 'NOT_DONE'
  }
  if ((current === 'NEEDS_INFO' || current === 'REJECTED') && now > month.responseDueAt) {
    steps.push({ from: current, to: 'NOT_VERIFIED', reason: 'RESPONSE_DEADLINE' })
  }
  return steps
}

export function effectiveStatus(status: KpiStatusValue, month: MonthDeadlinesLike, now: Date): KpiStatusValue {
  const steps = pendingSystemTransitions(status, month, now)
  return steps.length > 0 ? steps[steps.length - 1].to : status
}

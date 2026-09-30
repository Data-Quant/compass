// Spec 10.3: each lead's KPI claims — locked, claimed, verified, rejected at first decision, appealed — and a flag. Pure.
import { formatMonthKey, monthKeyOf, type MonthKey } from './calendar'
import type { KpiStatusValue, LeadClaimStats } from './view-types'

export const LEAD_FLAG_REJECTION_RATE = 0.25
export const LEAD_FLAG_MIN_DECIDED = 4
export const HISTORY_MONTHS = 3
export const MAX_HISTORY_MONTHS = 12

export interface HistoryEvent { action: string; toStatus: string | null }
/** `status` is the effective status; `events` are oldest first. */
export interface KpiHistory { setterId: string; status: KpiStatusValue; events: readonly HistoryEvent[] }
type Counts = Omit<LeadClaimStats, 'claimRate' | 'rejectionRate' | 'flagged'>

const EMPTY: Counts = { locked: 0, claimedDone: 0, claimedNotDone: 0, verified: 0, needsInfo: 0, rejectedAtFirstDecision: 0, decided: 0, appealed: 0, finallyNotVerified: 0 }
const COUNT_KEYS = Object.keys(EMPTY) as Array<keyof Counts>
const one = (value: boolean) => (value ? 1 : 0)

/** One KPI's contribution, each 0 or 1. A KPI cancelled while still a draft never counts as locked. */
export function kpiContribution(kpi: KpiHistory): Counts {
  const claim = kpi.events.find((e) => e.action === 'CLAIM')
  const decisions = kpi.events.filter((e) => e.action === 'DECIDE')
  const wasLocked = kpi.status !== 'DRAFT' && (kpi.status !== 'CANCELLED' || kpi.events.some((e) => e.toStatus === 'LOCKED'))
  return {
    locked: one(wasLocked),
    claimedDone: one(claim?.toStatus === 'CLAIMED_DONE'),
    claimedNotDone: one(claim?.toStatus === 'NOT_DONE'),
    verified: one(kpi.status === 'VERIFIED'),
    needsInfo: one(decisions.some((e) => e.toStatus === 'NEEDS_INFO')),
    rejectedAtFirstDecision: one(decisions[0]?.toStatus === 'REJECTED'),
    decided: one(decisions.length > 0),
    appealed: one(kpi.events.some((e) => e.action === 'APPEAL')),
    finallyNotVerified: one(kpi.status === 'NOT_VERIFIED'),
  }
}

const add = (a: Counts, b: Counts): Counts => Object.fromEntries(COUNT_KEYS.map((key) => [key, a[key] + b[key]])) as Counts

export function leadStats(kpis: readonly KpiHistory[]): Map<string, LeadClaimStats> {
  const totals = new Map<string, Counts>()
  for (const kpi of kpis) totals.set(kpi.setterId, add(totals.get(kpi.setterId) ?? EMPTY, kpiContribution(kpi)))
  return new Map([...totals].map(([setterId, counts]) => {
    const rejectionRate = counts.decided > 0 ? counts.rejectedAtFirstDecision / counts.decided : null
    return [setterId, {
      ...counts,
      claimRate: counts.locked > 0 ? counts.claimedDone / counts.locked : null,
      rejectionRate,
      flagged: counts.decided >= LEAD_FLAG_MIN_DECIDED && (rejectionRate ?? 0) >= LEAD_FLAG_REJECTION_RATE,
    }]
  }))
}

export const monthIndex = (key: MonthKey): number => key.year * 12 + key.month - 1
const monthAt = (index: number): MonthKey => ({ year: Math.floor(index / 12), month: (index % 12) + 1 })

/** The current Karachi month and the two before it. */
export function defaultWindow(now: Date): { fromMonth: string; toMonth: string } {
  const current = monthIndex(monthKeyOf(now))
  return { fromMonth: formatMonthKey(monthAt(current - (HISTORY_MONTHS - 1))), toMonth: formatMonthKey(monthAt(current)) }
}

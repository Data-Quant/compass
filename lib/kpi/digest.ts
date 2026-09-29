import { karachiCalendarDate, nthWorkingDayOfMonth, parseMonthKey, sameCalendarDate, workingDayBefore } from './calendar'
import { formatKarachiDate, monthLabel } from './format'
import { canDecideChange, canVerify, type KpiActor, type KpiRef } from './permissions'
import type { KpiStatusValue } from './view-types'

export type DigestKind =
  | 'SET_KPIS'
  | 'DEPARTMENTS_WITHOUT_KPIS'
  | 'CLAIMS_DUE'
  | 'RESPONSE_NEEDED'
  | 'VERIFY_QUEUE'
  | 'CHANGE_REQUESTS'
  | 'OVERDUE'

/** One line of a person's daily email. `path` is relative to the app URL. */
export interface DigestItem { kind: DigestKind; text: string; path: string }

export interface DigestKpi extends KpiRef {
  id: string
  title: string
  /** The effective status. */
  status: KpiStatusValue
  decidedAt: Date | null
  appealUsed: boolean
  claimsDueAt: Date
  verifyDueAt: Date
  responseDueAt: Date
  targetFinalAt: Date
}

export interface DigestInput {
  now: Date
  currentMonth: { monthKey: string; goalsLockAt: Date }
  teamSetterIds: readonly string[]
  teamSettersWithKpis: ReadonlySet<string>
  departmentSetterIds: readonly string[]
  /** Labels of departments with no KPIs in the current month. */
  departmentsWithoutKpis: readonly string[]
  /** Visible KPIs of every month that is not final yet. */
  kpis: readonly DigestKpi[]
  pendingChanges: ReadonlyArray<{ kpiId: string; requestedById: string }>
  /** Verifier-eligible people, HR included. */
  verifiers: readonly KpiActor[]
  hrIds: readonly string[]
  /** Month keys past their final date that are not final. */
  lateMonths: readonly string[]
}

type Entry = [userId: string, item: DigestItem]

const MAX_TITLES = 3

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`
const entry = (userId: string, kind: DigestKind, text: string, path: string): Entry => [userId, { kind, text, path }]

function titles(kpis: readonly DigestKpi[]): string {
  const names = kpis.slice(0, MAX_TITLES).map((kpi) => kpi.title).join(', ')
  return kpis.length > MAX_TITLES ? `${names} and ${kpis.length - MAX_TITLES} more` : names
}

/** Team KPIs are claimed by their setter; department KPIs by their owners. */
function claimersOf(kpi: DigestKpi): readonly string[] {
  return kpi.scope === 'TEAM' ? [kpi.setterId] : kpi.assigneeIds
}

function groupBy(kpis: readonly DigestKpi[], recipients: (kpi: DigestKpi) => readonly string[]): Map<string, DigestKpi[]> {
  const groups = new Map<string, DigestKpi[]>()
  for (const kpi of kpis) {
    for (const id of recipients(kpi)) groups.set(id, [...(groups.get(id) ?? []), kpi])
  }
  return groups
}

function settingReminders(input: DigestInput): Entry[] {
  const key = parseMonthKey(input.currentMonth.monthKey)
  if (!key || input.now > input.currentMonth.goalsLockAt) return []
  const today = karachiCalendarDate(input.now)
  if (![1, 4].some((n) => sameCalendarDate(today, nthWorkingDayOfMonth(key, n)))) return []
  const month = monthLabel(input.currentMonth.monthKey)
  const lock = formatKarachiDate(input.currentMonth.goalsLockAt.toISOString())
  const team = input.teamSetterIds
    .filter((id) => !input.teamSettersWithKpis.has(id))
    .map((id) => entry(id, 'SET_KPIS', `Set your team’s KPIs for ${month}. They lock on ${lock}.`, '/kpis'))
  const departments =
    input.departmentsWithoutKpis.length === 0
      ? []
      : input.departmentSetterIds.map((id) =>
          entry(id, 'DEPARTMENTS_WITHOUT_KPIS', `Departments without KPIs for ${month}: ${input.departmentsWithoutKpis.join(', ')}. They lock on ${lock}.`, '/kpis/department'),
        )
  return [...team, ...departments]
}

function claimReminders(input: DigestInput): Entry[] {
  const today = karachiCalendarDate(input.now)
  const due = input.kpis.filter((kpi) => kpi.status === 'LOCKED' && sameCalendarDate(today, workingDayBefore(karachiCalendarDate(kpi.claimsDueAt))))
  return [...groupBy(due, claimersOf)].map(([id, kpis]) =>
    entry(id, 'CLAIMS_DUE', `Claim ${plural(kpis.length, 'KPI')} before claims close on ${formatKarachiDate(kpis[0].claimsDueAt.toISOString())}: ${titles(kpis)}`, '/kpis'),
  )
}

/** Daily while a reply or appeal is still possible, so a missed or failed run never loses the only notice. */
function responseReminders(input: DigestInput): Entry[] {
  const answered = input.kpis.filter(
    (kpi) => (kpi.status === 'NEEDS_INFO' || (kpi.status === 'REJECTED' && !kpi.appealUsed)) && input.now <= kpi.responseDueAt,
  )
  return [...groupBy(answered, (kpi) => (kpi.claimedById ? [kpi.claimedById] : claimersOf(kpi)))].map(([id, kpis]) =>
    entry(
      id,
      'RESPONSE_NEEDED',
      `Execution answered ${plural(kpis.length, 'claim')}; reply or appeal by ${formatKarachiDate(kpis[0].responseDueAt.toISOString())}: ${titles(kpis)}`,
      '/kpis',
    ),
  )
}

function verifierReminders(input: DigestInput): Entry[] {
  const queue = input.kpis.filter((kpi) => kpi.status === 'CLAIMED_DONE' || kpi.status === 'APPEALED')
  const byId = new Map(input.kpis.map((kpi) => [kpi.id, kpi]))
  return input.verifiers.flatMap((verifier) => {
    const toVerify = queue.filter((kpi) => canVerify(verifier, kpi)).length
    const toDecide = input.pendingChanges.filter((change) => {
      const kpi = byId.get(change.kpiId)
      return kpi !== undefined && canDecideChange(verifier, kpi, change.requestedById)
    }).length
    return [
      ...(toVerify > 0 ? [entry(verifier.id, 'VERIFY_QUEUE', `${plural(toVerify, 'claim')} waiting for verification`, '/kpis/verify')] : []),
      ...(toDecide > 0 ? [entry(verifier.id, 'CHANGE_REQUESTS', `${plural(toDecide, 'change request')} waiting for a decision`, '/kpis/verify')] : []),
    ]
  })
}

function hrReminders(input: DigestInput): Entry[] {
  const late = input.kpis.filter(
    (kpi) => (kpi.status === 'CLAIMED_DONE' && input.now > kpi.verifyDueAt) || (kpi.status === 'APPEALED' && input.now > kpi.targetFinalAt),
  )
  return input.hrIds.flatMap((id) => [
    ...(late.length > 0 ? [entry(id, 'OVERDUE', `${plural(late.length, 'claim')} past the verification deadline`, '/kpis/verify')] : []),
    ...(input.lateMonths.length > 0 ? [entry(id, 'OVERDUE', `Not final yet: ${input.lateMonths.map((key) => monthLabel(key)).join(', ')}`, '/admin/kpis')] : []),
  ])
}

/** Everyone's reminders for the day, in a fixed order per person. */
export function buildDigests(input: DigestInput): Map<string, DigestItem[]> {
  const entries = [...settingReminders(input), ...claimReminders(input), ...responseReminders(input), ...verifierReminders(input), ...hrReminders(input)]
  const digests = new Map<string, DigestItem[]>()
  for (const [userId, item] of entries) digests.set(userId, [...(digests.get(userId) ?? []), item])
  return digests
}

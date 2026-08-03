import type { RelationshipType } from '@/types'
import { calculateLeaveDuration } from '@/lib/leave-utils'
import { isThreeEDepartment } from '@/lib/company-branding'
import type {
  Availability,
  ClientConcentration,
  CompensationDomain,
  DomainAvailability,
  EmploymentStatus,
  EvaluationLens,
} from '@/lib/analytics/employee-360-contracts'

/**
 * Geometry and derived read-outs for the Employee 360 orrery.
 *
 * The orrery puts one person at the centre and places each evaluation lens at a
 * radius set by that lens's score. The polygon joining those points is the whole
 * point of the view: a regular shape means every group rates the person alike, a
 * spiky one means they do not. That is consensus made visible rather than stated
 * as a number nobody reads.
 *
 * A second, fainter polygon traces the org average for the same lenses, so a
 * score reads as a deviation from normal rather than a bare figure -- a 3.1 from
 * peers means nothing until you know peers average 3.4.
 */

/** Fixed lens order, so two people's shapes can be compared directly. */
export const ORRERY_LENS_ORDER: RelationshipType[] = [
  'TEAM_LEAD',
  'PEER',
  'HR',
  'DEPT',
  'DIRECT_REPORT',
  'C_LEVEL',
  'CROSS_DEPARTMENT',
  'SELF',
]

export const MAX_LENS_SCORE = 4

export interface OrreryPoint {
  lens: RelationshipType
  score: number
  /** Org mean for this lens, or null when it is not known. */
  average: number | null
  angle: number
  x: number
  y: number
  averageX: number | null
  averageY: number | null
}

/**
 * Even a zero score keeps a visible radius. Collapsing it to the centre would
 * make a low score indistinguishable from a missing one.
 */
export function scoreToRadius(score: number, innerRadius: number, outerRadius: number): number {
  const clamped = Math.min(Math.max(Number.isFinite(score) ? score : 0, 0), MAX_LENS_SCORE)
  return innerRadius + (clamped / MAX_LENS_SCORE) * (outerRadius - innerRadius)
}

/** Angles start at twelve o'clock and run clockwise. */
export function lensAngle(index: number, total: number): number {
  if (total <= 0) return -Math.PI / 2
  return -Math.PI / 2 + (index / total) * Math.PI * 2
}

/**
 * Every lens either person has, in canonical order.
 *
 * Comparing two people requires both shapes on the same axes; if each used only
 * its own lenses the two outlines would sit at different bearings and could not
 * be read against each other.
 */
export function unionLensOrder(
  ...sets: Array<Partial<Record<RelationshipType, number>>>
): RelationshipType[] {
  return ORRERY_LENS_ORDER.filter((lens) => sets.some((set) => set[lens] !== undefined))
}

export function buildOrreryPoints(params: {
  perLens: Partial<Record<RelationshipType, number>>
  orgAverage?: Partial<Record<RelationshipType, number>>
  innerRadius: number
  outerRadius: number
  /** Axes to plot against. Defaults to this person's own lenses. */
  lensOrder?: RelationshipType[]
}): OrreryPoint[] {
  // Angles come from the shared axis list so overlaid shapes align, but a point
  // is only emitted where this person actually has a reading.
  const axes = params.lensOrder ?? ORRERY_LENS_ORDER.filter((lens) => params.perLens[lens] !== undefined)

  return axes.flatMap((lens, index) => {
    const raw = params.perLens[lens]
    if (raw === undefined) return []
    const score = raw
    const average = params.orgAverage?.[lens] ?? null
    const angle = lensAngle(index, axes.length)
    const radius = scoreToRadius(score, params.innerRadius, params.outerRadius)
    const averageRadius =
      average === null ? null : scoreToRadius(average, params.innerRadius, params.outerRadius)

    return [
      {
        lens,
        score,
        average,
        angle,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        averageX: averageRadius === null ? null : Math.cos(angle) * averageRadius,
        averageY: averageRadius === null ? null : Math.sin(angle) * averageRadius,
      },
    ]
  })
}

/** Closed SVG path through the given coordinates. Empty when there is nothing to draw. */
export function polygonPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return ''
  if (points.length === 1) return ''

  return `${points.map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')} Z`
}

export function averagePolygonPath(points: OrreryPoint[]): string {
  const known = points.filter(
    (point): point is OrreryPoint & { averageX: number; averageY: number } =>
      point.averageX !== null && point.averageY !== null
  )

  // Only draw the reference shape when every lens has an average; a partial one
  // would imply a comparison that is not actually being made.
  if (known.length !== points.length) return ''

  return polygonPath(known.map((point) => ({ x: point.averageX, y: point.averageY })))
}

/* ---------- Outlook ---------- */

export type OutlookTone = 'STRONG' | 'STEADY' | 'WATCH' | 'UNKNOWN'

export interface Outlook {
  headline: string
  detail: string
  tone: OutlookTone
  /** Set when evaluators disagree enough that the headline should be read loosely. */
  caveat: string | null
}

/** Below this, the lenses disagree enough to qualify any read of the person. */
export const LOW_CONSENSUS_THRESHOLD = 0.5

/**
 * Outlook is derived, never stored.
 *
 * It reuses the talent grid's own cell label rather than re-deriving one, so the
 * two views can never disagree about the same person. Consensus is applied as a
 * caveat instead of changing the verdict: split opinions make a verdict less
 * certain, they do not make it the opposite verdict.
 */
export function deriveOutlook(input: {
  cellLabel: string | null
  momentumDelta: number | null
  consensus: number | null
  isNew: boolean
}): Outlook {
  if (input.isNew || !input.cellLabel) {
    return {
      headline: 'Too early to read',
      detail:
        'Not enough history yet. A direction appears once this person has been through more than one period.',
      tone: 'UNKNOWN',
      caveat: null,
    }
  }

  const movement =
    input.momentumDelta === null
      ? 'no comparable previous period'
      : input.momentumDelta > 0
        ? `up ${input.momentumDelta.toFixed(1)} points since last period`
        : input.momentumDelta < 0
          ? `down ${Math.abs(input.momentumDelta).toFixed(1)} points since last period`
          : 'level with last period'

  const tone: OutlookTone =
    input.cellLabel === 'Top performer' || input.cellLabel === 'Accelerate'
      ? 'STRONG'
      : input.cellLabel === 'At-risk' ||
          input.cellLabel === 'Needs support' ||
          input.cellLabel === 'Slipping star' ||
          input.cellLabel === 'Drifting'
        ? 'WATCH'
        : 'STEADY'

  const caveat =
    input.consensus !== null && input.consensus < LOW_CONSENSUS_THRESHOLD
      ? 'Evaluator groups disagree markedly about this person, so treat the read as provisional and look at the orbit shape.'
      : null

  return {
    headline: input.cellLabel,
    detail: `Performance band and momentum place them here, ${movement}.`,
    tone,
    caveat,
  }
}

/* ---------- Compensation ---------- */

export interface CompPoint {
  effectiveFrom: string
  total: number
}

/**
 * Percentage change across the compensation history.
 *
 * Null with fewer than two points: a single salary is a fact, not a trajectory,
 * and rendering "0% change" against it would assert something untrue.
 */
export function compGrowth(points: readonly CompPoint[]): number | null {
  if (points.length < 2) return null

  const first = points[0].total
  const last = points[points.length - 1].total
  if (first <= 0) return null

  return ((last - first) / first) * 100
}

/* ---------- Cockpit data transforms ---------- */

export interface ScorablePeriodCandidate {
  id: string
  name: string
  startDate: string | Date
  endDate: string | Date
  isActive: boolean
  /** Number of submitted evaluations that contain a usable numeric score. */
  submittedScoreCount: number
}

function dateTime(value: string | Date): number {
  const time = value instanceof Date ? value.getTime() : Date.parse(value)
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY
}

/**
 * Scorable periods only, newest first. The input is never mutated.
 *
 * A period with assignments or drafts but no submitted numeric ratings is not
 * scorable and must never be used to label an older score.
 */
export function getScorablePeriods<T extends ScorablePeriodCandidate>(
  periods: readonly T[]
): T[] {
  return periods
    .filter(
      (period) =>
        Number.isFinite(period.submittedScoreCount) && period.submittedScoreCount > 0
    )
    .slice()
    .sort(
      (a, b) =>
        dateTime(b.startDate) - dateTime(a.startDate) ||
        dateTime(b.endDate) - dateTime(a.endDate) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id)
    )
}

/**
 * Honor an explicitly requested scorable period; otherwise choose the newest
 * active scorable period, falling back to the newest scorable period.
 */
export function selectScorablePeriod<T extends ScorablePeriodCandidate>(
  periods: readonly T[],
  requestedPeriodId?: string | null
): T | null {
  const scorable = getScorablePeriods(periods)
  if (requestedPeriodId) {
    const requested = scorable.find((period) => period.id === requestedPeriodId)
    if (requested) return requested
  }
  return scorable.find((period) => period.isActive) ?? scorable[0] ?? null
}

/**
 * Turn explicit source-presence checks into a domain availability state.
 * Callers decide what the required sources are; zero values remain valid facts
 * when their source is present.
 */
export function deriveAvailability(sourcePresence: readonly boolean[]): Availability {
  if (sourcePresence.length === 0 || sourcePresence.every((present) => !present)) {
    return 'NO_DATA'
  }
  return sourcePresence.every(Boolean) ? 'AVAILABLE' : 'PARTIAL'
}

export interface AvailabilitySummary {
  status: Availability
  availableDomains: number
  partialDomains: number
  noDataDomains: number
  totalDomains: number
  /**
   * Data-quality completeness on a 0-1 scale. A partially populated domain
   * contributes half; this is a coverage readout, never a people score.
   */
  completeness: number
}

export function summarizeAvailability(
  availability: DomainAvailability
): AvailabilitySummary {
  const values = Object.values(availability)
  const availableDomains = values.filter((value) => value === 'AVAILABLE').length
  const partialDomains = values.filter((value) => value === 'PARTIAL').length
  const noDataDomains = values.filter((value) => value === 'NO_DATA').length
  const totalDomains = values.length
  const completeness =
    totalDomains === 0 ? 0 : (availableDomains + partialDomains * 0.5) / totalDomains

  return {
    status:
      availableDomains === totalDomains
        ? 'AVAILABLE'
        : noDataDomains === totalDomains
          ? 'NO_DATA'
          : 'PARTIAL',
    availableDomains,
    partialDomains,
    noDataDomains,
    totalDomains,
    completeness,
  }
}

/**
 * Users without payroll profiles are active. Only an explicit payroll
 * deactivation archives someone from the default Employee 360 roster.
 */
export function resolveEmploymentStatus(
  isPayrollActive: boolean | null | undefined
): EmploymentStatus {
  return isPayrollActive === false ? 'ARCHIVED' : 'ACTIVE'
}

/** 3E employees are outside the Plutus Employee 360 population. */
export function isEmployee360Eligible(
  employee: { department?: string | null } | null | undefined
): boolean {
  return Boolean(employee) && !isThreeEDepartment(employee?.department)
}

export function sortEvaluationLenses<T extends Pick<EvaluationLens, 'relationshipType'>>(
  lenses: readonly T[]
): T[] {
  const rank = new Map(ORRERY_LENS_ORDER.map((lens, index) => [lens, index]))
  return lenses
    .slice()
    .sort(
      (a, b) =>
        (rank.get(a.relationshipType) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(b.relationshipType) ?? Number.MAX_SAFE_INTEGER)
    )
}

/**
 * Self score minus the already-computed weighted overall, expressed on the
 * common 0-4 lens scale. SELF never enters the weighted overall calculation.
 */
export function selfVsOthersGap(
  selfScore: number | null | undefined,
  weightedOverallScore: number | null | undefined
): number | null {
  if (
    selfScore === null ||
    selfScore === undefined ||
    weightedOverallScore === null ||
    weightedOverallScore === undefined ||
    !Number.isFinite(selfScore) ||
    !Number.isFinite(weightedOverallScore)
  ) {
    return null
  }
  return selfScore - weightedOverallScore / 25
}

export interface SalaryObservation {
  effectiveFrom: string
  amount: number
  currency: string
  periodId?: string | null
  periodName?: string | null
  periodStatus: string | null
  receiptStatus: string | null
}

export const FINALIZED_PAYROLL_PERIOD_STATUSES = new Set([
  'APPROVED',
  'SENDING',
  'SENT',
  'PARTIAL',
  'LOCKED',
])

export const USABLE_PAYROLL_RECEIPT_STATUSES = new Set([
  'READY',
  'ENVELOPE_CREATED',
  'SENT',
  'COMPLETED',
])

export function isFinalizedPayrollPeriodStatus(status: string | null | undefined): boolean {
  return status !== null && status !== undefined && FINALIZED_PAYROLL_PERIOD_STATUSES.has(status)
}

export function isUsablePayrollReceiptStatus(status: string | null | undefined): boolean {
  return status !== null && status !== undefined && USABLE_PAYROLL_RECEIPT_STATUSES.has(status)
}

/**
 * Collapse repeated monthly basic-salary observations into step changes.
 *
 * Currency streams are tracked independently. If more than one currency is
 * present, the scalar current/growth fields stay null so no exchange-rate or
 * cross-currency claim is invented.
 */
export function buildCompensationTrajectory(
  observations: readonly SalaryObservation[]
): CompensationDomain {
  const usable = observations
    .map((observation, index) => ({
      ...observation,
      currency: observation.currency.trim().toUpperCase(),
      index,
    }))
    .filter((observation) => {
      if (
        !observation.currency ||
        !Number.isFinite(observation.amount) ||
        observation.amount <= 0 ||
        !Number.isFinite(dateTime(observation.effectiveFrom))
      ) {
        return false
      }
      if (!isFinalizedPayrollPeriodStatus(observation.periodStatus)) {
        return false
      }
      if (!isUsablePayrollReceiptStatus(observation.receiptStatus)) {
        return false
      }
      return true
    })
    .sort(
      (a, b) =>
        dateTime(a.effectiveFrom) - dateTime(b.effectiveFrom) || a.index - b.index
    )

  const byCurrency = new Map<string, typeof usable>()
  for (const observation of usable) {
    const series = byCurrency.get(observation.currency) ?? []
    series.push(observation)
    byCurrency.set(observation.currency, series)
  }

  const history: CompensationDomain['history'] = []
  const changeEvents: CompensationDomain['changeEvents'] = []
  const latestByCurrency = new Map<string, number>()

  for (const [currency, series] of byCurrency.entries()) {
    let previous: (typeof series)[number] | null = null
    for (const observation of series) {
      if (previous?.amount === observation.amount) continue

      history.push({
        effectiveFrom: new Date(observation.effectiveFrom).toISOString(),
        amount: observation.amount,
        currency,
        periodId: observation.periodId ?? null,
        periodName: observation.periodName ?? null,
      })

      if (previous) {
        const delta = observation.amount - previous.amount
        changeEvents.push({
          effectiveFrom: new Date(observation.effectiveFrom).toISOString(),
          previousAmount: previous.amount,
          amount: observation.amount,
          delta,
          percentChange: previous.amount > 0 ? (delta / previous.amount) * 100 : null,
          currency,
          periodId: observation.periodId ?? null,
          periodName: observation.periodName ?? null,
        })
      }

      previous = observation
      latestByCurrency.set(currency, observation.amount)
    }
  }

  history.sort((a, b) => dateTime(a.effectiveFrom) - dateTime(b.effectiveFrom))
  changeEvents.sort((a, b) => dateTime(a.effectiveFrom) - dateTime(b.effectiveFrom))

  const currencies = [...byCurrency.keys()].sort()
  const currency = currencies.length === 1 ? currencies[0] : null
  const currentBasic = currency ? latestByCurrency.get(currency) ?? null : null
  const currencyHistory = currency
    ? history.filter((point) => point.currency === currency)
    : []
  const growth =
    currencyHistory.length < 2
      ? null
      : compGrowth(
          currencyHistory.map((point) => ({
            effectiveFrom: point.effectiveFrom,
            total: point.amount,
          }))
        )

  return {
    currency,
    currentBasic,
    currencies,
    history,
    changeEvents,
    growth,
  }
}

export interface ClientConcentrationInput {
  clientId: string
  clientName: string
  /** Defaults to one assignment. No workload weighting is inferred. */
  assignmentCount?: number
}

/**
 * Share of recorded assignments attached to the most represented client.
 * This deliberately describes roster concentration, not time allocation or
 * client impact.
 */
export function computeClientConcentration(
  assignments: readonly ClientConcentrationInput[]
): ClientConcentration | null {
  const grouped = new Map<string, { clientId: string; clientName: string; count: number }>()
  for (const assignment of assignments) {
    const count = assignment.assignmentCount ?? 1
    if (!assignment.clientId || !assignment.clientName || !Number.isFinite(count) || count <= 0) {
      continue
    }
    const existing = grouped.get(assignment.clientId)
    if (existing) existing.count += count
    else {
      grouped.set(assignment.clientId, {
        clientId: assignment.clientId,
        clientName: assignment.clientName,
        count,
      })
    }
  }

  const rows = [...grouped.values()]
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  if (total <= 0) return null

  rows.sort(
    (a, b) =>
      b.count - a.count ||
      a.clientName.localeCompare(b.clientName) ||
      a.clientId.localeCompare(b.clientId)
  )
  const primary = rows[0]
  const hasTiedPrimary = rows.length > 1 && rows[1].count === primary.count
  return {
    primaryClientId: hasTiedPrimary ? null : primary.clientId,
    primaryClientName: hasTiedPrimary ? null : primary.clientName,
    share: primary.count / total,
    basis: 'ASSIGNMENT_COUNT',
  }
}

export interface LeaveObservation {
  status: string
  startDate: string | Date
  endDate: string | Date
  isHalfDay: boolean
}

/** Approved weekday leave only; invalid and weekend-only ranges add nothing. */
export function sumApprovedWorkingLeaveDays(
  requests: readonly LeaveObservation[]
): number {
  return requests.reduce((total, request) => {
    if (request.status !== 'APPROVED') return total
    const start = request.startDate instanceof Date ? request.startDate : new Date(request.startDate)
    const end = request.endDate instanceof Date ? request.endDate : new Date(request.endDate)
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return total
    return total + calculateLeaveDuration(start, end, request.isHalfDay)
  }, 0)
}

export function sortTimelineNewestFirst<T extends { occurredAt: string }>(
  events: readonly T[]
): T[] {
  return events
    .slice()
    .sort((a, b) => dateTime(b.occurredAt) - dateTime(a.occurredAt))
}

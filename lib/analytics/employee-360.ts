import type { RelationshipType } from '@/types'

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

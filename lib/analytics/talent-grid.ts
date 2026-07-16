import type {
  EmployeePeriodScore,
  LensScore,
  PeriodScoreMatrix,
} from '@/lib/analytics/period-score-matrix'
import type { RelationshipType } from '@/types'

/** Points on the 0-100 overall-score scale. |delta| <= this is STABLE. */
export const MOMENTUM_DEAD_BAND = 3.0

/** Fewer than this many scored employees cannot be split into tertiles. */
const MIN_COHORT_FOR_TERTILES = 3

/** The 0-4 lens scale, used to normalize spread onto 0-1. */
const LENS_SCALE = 4

export type PerformanceBand = 'LOW' | 'MID' | 'HIGH'
export type MomentumBand = 'DECLINING' | 'STABLE' | 'RISING'

export interface TalentGridEntry {
  employeeId: string
  department: string | null
  /** 0-100 scale. */
  performanceScore: number
  performanceBand: PerformanceBand
  /** Points on the 0-100 scale. Null for new joiners. */
  momentumDelta: number | null
  momentumBand: MomentumBand | null
  /** 0-1, where 1 is total evaluator agreement. Null when under two external lenses. */
  consensus: number | null
  cellLabel: string | null
  isNew: boolean
}

export interface TalentGridResult {
  entries: TalentGridEntry[]
  insufficientData: boolean
}

const CELL_LABELS: Record<PerformanceBand, Record<MomentumBand, string>> = {
  HIGH: { DECLINING: 'Slipping star', STABLE: 'Top performer', RISING: 'Accelerate' },
  MID: { DECLINING: 'Drifting', STABLE: 'Core', RISING: 'Emerging' },
  LOW: { DECLINING: 'At-risk', STABLE: 'Needs support', RISING: 'Improving' },
}

/**
 * Agreement across external lenses, on 0-1. A wide spread between how different
 * groups rate someone means low consensus. SELF is excluded — it measures
 * self-awareness, not evaluator agreement. Null when under two external lenses.
 */
export function computeConsensus(
  perLens: Partial<Record<RelationshipType, LensScore>>
): number | null {
  const externalScores = Object.entries(perLens)
    .filter(([lens, lensScore]) => lens !== 'SELF' && lensScore !== undefined)
    .map(([, lensScore]) => (lensScore as LensScore).normalizedScore)

  if (externalScores.length < 2) return null

  const spread = Math.max(...externalScores) - Math.min(...externalScores)
  return Math.min(1, Math.max(0, 1 - spread / LENS_SCALE))
}

function toPerformanceBander(
  scores: readonly EmployeePeriodScore[]
): (score: number) => PerformanceBand {
  if (scores.length < MIN_COHORT_FOR_TERTILES) {
    return () => 'MID'
  }

  const sorted = [...scores.map((entry) => entry.overallScore)].sort((a, b) => a - b)
  const lowerThreshold = sorted[Math.floor(sorted.length / 3)]
  const upperThreshold = sorted[Math.floor((sorted.length * 2) / 3)]

  return (score: number) => {
    if (score < lowerThreshold) return 'LOW'
    if (score < upperThreshold) return 'MID'
    return 'HIGH'
  }
}

function toMomentumBand(delta: number): MomentumBand {
  if (Math.abs(delta) <= MOMENTUM_DEAD_BAND) return 'STABLE'
  return delta > 0 ? 'RISING' : 'DECLINING'
}

/**
 * Place every current-period employee on performance x momentum x consensus.
 *
 * Performance uses cohort-relative tertiles over all scored employees in the
 * current period so the grid populates meaningfully; the absolute score travels
 * with each entry so the UI can always show the real number.
 */
export function computeTalentGrid(params: {
  current: PeriodScoreMatrix
  comparison: PeriodScoreMatrix | null
}): TalentGridResult {
  const bandFor = toPerformanceBander(params.current.scores)
  const previousById = new Map(
    (params.comparison?.scores || []).map((entry) => [entry.employeeId, entry.overallScore])
  )

  const entries = params.current.scores.map((entry): TalentGridEntry => {
    const performanceBand = bandFor(entry.overallScore)
    const previousScore = previousById.get(entry.employeeId)
    const isNew = params.comparison !== null && previousScore === undefined
    const momentumDelta = previousScore === undefined ? null : entry.overallScore - previousScore
    const momentumBand = momentumDelta === null ? null : toMomentumBand(momentumDelta)

    return {
      employeeId: entry.employeeId,
      department: entry.department,
      performanceScore: entry.overallScore,
      performanceBand,
      momentumDelta,
      momentumBand,
      consensus: computeConsensus(entry.perLens),
      cellLabel: momentumBand ? CELL_LABELS[performanceBand][momentumBand] : null,
      isNew,
    }
  })

  return { entries, insufficientData: params.comparison === null }
}

import type { LensScore, PeriodScoreMatrix } from '@/lib/analytics/period-score-matrix'
import type { RelationshipType } from '@/types'

/** Maximum entries per flag list. */
export const BLIND_SPOT_FLAG_LIMIT = 5

/** Spread and gap analysis need at least two external lenses to mean anything. */
const MIN_EXTERNAL_LENSES = 2

export interface BlindSpotEntry {
  employeeId: string
  department: string | null
  /** 0-4 per lens, including SELF. */
  perLens: Partial<Record<RelationshipType, number>>
  selfScore: number | null
  weightedOthersScore: number | null
  /** selfScore - weightedOthersScore. Positive means they rate themselves above others do. */
  selfGap: number | null
  /** max - min across external lenses, on the 0-4 scale. */
  lensSpread: number | null
}

export interface BlindSpotsResult {
  entries: BlindSpotEntry[]
  topSelfGaps: BlindSpotEntry[]
  topSpreads: BlindSpotEntry[]
  insufficientData: boolean
}

/**
 * Surface where an employee is seen differently by different lenses, and where
 * their self-assessment diverges from everyone else's.
 *
 * Employees with fewer than two external lenses are excluded rather than shown
 * as zero — a single lens has no spread and no meaningful "others" baseline.
 */
export function computeBlindSpots(matrix: PeriodScoreMatrix): BlindSpotsResult {
  const entries: BlindSpotEntry[] = []

  for (const score of matrix.scores) {
    const externalLenses = Object.entries(score.perLens).filter(
      ([lens, lensScore]) => lens !== 'SELF' && lensScore !== undefined
    ) as Array<[RelationshipType, LensScore]>

    if (externalLenses.length < MIN_EXTERNAL_LENSES) continue

    const perLens: Partial<Record<RelationshipType, number>> = {}
    for (const [lens, lensScore] of Object.entries(score.perLens)) {
      if (!lensScore) continue
      perLens[lens as RelationshipType] = lensScore.normalizedScore
    }

    const externalScores = externalLenses.map(([, lensScore]) => lensScore.normalizedScore)
    const lensSpread = Math.max(...externalScores) - Math.min(...externalScores)

    let weightSum = 0
    let weightedTotal = 0
    for (const [lens, lensScore] of externalLenses) {
      const weight = score.weights[lens] ?? 0
      if (weight <= 0) continue
      weightSum += weight
      weightedTotal += lensScore.normalizedScore * weight
    }
    const weightedOthersScore = weightSum > 0 ? weightedTotal / weightSum : null

    const selfScore = score.perLens.SELF?.normalizedScore ?? null
    const selfGap =
      selfScore !== null && weightedOthersScore !== null ? selfScore - weightedOthersScore : null

    entries.push({
      employeeId: score.employeeId,
      department: score.department,
      perLens,
      selfScore,
      weightedOthersScore,
      selfGap,
      lensSpread,
    })
  }

  const topSelfGaps = entries
    .filter((entry): entry is BlindSpotEntry & { selfGap: number } => entry.selfGap !== null)
    .sort((a, b) => Math.abs(b.selfGap) - Math.abs(a.selfGap))
    .slice(0, BLIND_SPOT_FLAG_LIMIT)

  const topSpreads = entries
    .filter((entry): entry is BlindSpotEntry & { lensSpread: number } => entry.lensSpread !== null)
    .sort((a, b) => b.lensSpread - a.lensSpread)
    .slice(0, BLIND_SPOT_FLAG_LIMIT)

  return {
    entries,
    topSelfGaps,
    topSpreads,
    insufficientData: entries.length === 0,
  }
}

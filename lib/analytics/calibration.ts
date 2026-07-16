/** Below this many ratings an evaluator's mean is too noisy to rank. */
export const MIN_RATINGS_FOR_CALIBRATION = 5

/** Maximum entries per leniency list. */
const LENIENCY_LIMIT = 5

/** The rating buckets shown in the distribution. */
const DISTRIBUTION_BUCKETS = [1, 2, 3, 4] as const

/** The top rating value, which the four-rating quota governs. */
const TOP_RATING = 4

export interface CalibrationRating {
  evaluatorId: string
  ratingValue: number
}

/** One evaluator's four-rating usage within a single quota scope. */
export interface CapUsage {
  evaluatorId: string
  scope: string
  usedFours: number
  maxAllowed: number
}

export interface EvaluatorCalibration {
  evaluatorId: string
  ratingCount: number
  meanRating: number
  /** meanRating - orgMeanRating. Positive means more lenient than the org. */
  deviation: number
  fourRatingCount: number
  isExempt: boolean
}

export interface CalibrationResult {
  orgMeanRating: number
  totalRatings: number
  distribution: Array<{ rating: number; count: number }>
  fourRatingShare: number
  mostLenient: EvaluatorCalibration[]
  mostSevere: EvaluatorCalibration[]
  evaluatorsAtCap: number
  evaluatorsNearCap: number
  insufficientData: boolean
}

/**
 * Evaluator-side calibration: who rates high, who rates low, how ratings are
 * distributed, and how hard the four-rating cap is biting.
 *
 * Evaluators exempt from the cap (partner-level titles and the configured
 * C-level evaluator) are excluded from at/near-cap counts — an uncapped
 * evaluator giving many top ratings is expected, not a calibration signal. They
 * remain in the leniency lists, flagged, since their leniency is still real.
 */
export function computeCalibration(params: {
  ratings: readonly CalibrationRating[]
  capUsage: readonly CapUsage[]
  exemptEvaluatorIds: ReadonlySet<string>
}): CalibrationResult {
  const totalRatings = params.ratings.length

  if (totalRatings === 0) {
    return {
      orgMeanRating: 0,
      totalRatings: 0,
      distribution: DISTRIBUTION_BUCKETS.map((rating) => ({ rating, count: 0 })),
      fourRatingShare: 0,
      mostLenient: [],
      mostSevere: [],
      evaluatorsAtCap: 0,
      evaluatorsNearCap: 0,
      insufficientData: true,
    }
  }

  const orgMeanRating =
    params.ratings.reduce((sum, rating) => sum + rating.ratingValue, 0) / totalRatings

  const distribution = DISTRIBUTION_BUCKETS.map((rating) => ({
    rating,
    count: params.ratings.filter((entry) => Math.round(entry.ratingValue) === rating).length,
  }))

  const fourRatingCount = params.ratings.filter((entry) => entry.ratingValue === TOP_RATING).length

  const byEvaluator = new Map<string, CalibrationRating[]>()
  for (const rating of params.ratings) {
    byEvaluator.set(rating.evaluatorId, [...(byEvaluator.get(rating.evaluatorId) || []), rating])
  }

  const evaluators: EvaluatorCalibration[] = [...byEvaluator.entries()]
    .filter(([, evaluatorRatings]) => evaluatorRatings.length >= MIN_RATINGS_FOR_CALIBRATION)
    .map(([evaluatorId, evaluatorRatings]) => {
      const meanRating =
        evaluatorRatings.reduce((sum, rating) => sum + rating.ratingValue, 0) /
        evaluatorRatings.length
      return {
        evaluatorId,
        ratingCount: evaluatorRatings.length,
        meanRating,
        deviation: meanRating - orgMeanRating,
        fourRatingCount: evaluatorRatings.filter((rating) => rating.ratingValue === TOP_RATING)
          .length,
        isExempt: params.exemptEvaluatorIds.has(evaluatorId),
      }
    })

  const cappedUsage = params.capUsage.filter(
    (usage) => !params.exemptEvaluatorIds.has(usage.evaluatorId)
  )
  const atCap = new Set(
    cappedUsage
      .filter((usage) => usage.usedFours >= usage.maxAllowed)
      .map((usage) => usage.evaluatorId)
  )
  const nearCap = new Set(
    cappedUsage
      .filter((usage) => usage.usedFours >= usage.maxAllowed - 1)
      .map((usage) => usage.evaluatorId)
  )

  return {
    orgMeanRating,
    totalRatings,
    distribution,
    fourRatingShare: fourRatingCount / totalRatings,
    mostLenient: [...evaluators].sort((a, b) => b.deviation - a.deviation).slice(0, LENIENCY_LIMIT),
    mostSevere: [...evaluators].sort((a, b) => a.deviation - b.deviation).slice(0, LENIENCY_LIMIT),
    evaluatorsAtCap: atCap.size,
    evaluatorsNearCap: nearCap.size,
    insufficientData: false,
  }
}

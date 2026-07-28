/**
 * Below this many ratings a mean is thin enough to be worth marking.
 *
 * This flags rather than filters: everyone appears regardless of how many ratings
 * they gave, because an evaluator who rated only once still rated someone, and
 * hiding them makes the number unexplainable from the evaluatee's side. Rows below
 * the bar carry isProvisional so the reader can weigh them accordingly.
 */
export const MIN_RATINGS_FOR_CALIBRATION = 5

/** Maximum entries per leniency list. */
const LENIENCY_LIMIT = 5

/** The rating buckets shown in the distribution. */
const DISTRIBUTION_BUCKETS = [1, 2, 3, 4] as const

/** The top rating value, which the four-rating quota governs. */
const TOP_RATING = 4

/** Ratings with no resolvable relationship share this bucket. */
export const UNKNOWN_LENS = '__unknown__'

export interface CalibrationRating {
  evaluatorId: string
  ratingValue: number
  /**
   * The lens the rating was given through. Optional so callers without it still
   * work; those ratings share one bucket and are compared only to each other.
   */
  relationshipType?: string
}

export interface LensCalibration {
  relationshipType: string
  ratingCount: number
  meanRating: number
  /** meanRating for this evaluator in this lens, minus the lens mean. */
  deviation: number
  /** Fewer ratings than MIN_RATINGS_FOR_CALIBRATION, so read it with caution. */
  isProvisional: boolean
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
  /**
   * How far above the norm this evaluator rates, averaged over their ratings and
   * measured against the mean of whichever lens each rating was given through.
   *
   * Measured within lens rather than against one company-wide mean, because the
   * lenses sit far apart -- HR ratings average around 3.85 while team-lead ratings
   * average around 2.73. A single global mean would mark every HR evaluator lenient
   * and every team lead strict purely from which lens they occupy.
   */
  deviation: number
  /** The same figure per lens, for every lens they rated in. */
  perLens: LensCalibration[]
  /** Fewer ratings than MIN_RATINGS_FOR_CALIBRATION, so read it with caution. */
  isProvisional: boolean
  fourRatingCount: number
  isExempt: boolean
}

export interface CalibrationResult {
  orgMeanRating: number
  totalRatings: number
  distribution: Array<{ rating: number; count: number }>
  fourRatingShare: number
  /** Mean rating per lens. These sit far apart, so they are the baselines used. */
  lensMeans: Array<{ relationshipType: string; ratingCount: number; meanRating: number }>
  /** Every evaluator, most lenient first. mostLenient/mostSevere are its ends. */
  allEvaluators: EvaluatorCalibration[]
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
      lensMeans: [],
      allEvaluators: [],
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

  const lensOf = (rating: CalibrationRating) => rating.relationshipType || UNKNOWN_LENS

  // Each lens gets its own baseline. Without this an evaluator's deviation would
  // mostly reflect which lenses they happen to sit in.
  const lensTotals = new Map<string, { total: number; count: number }>()
  for (const rating of params.ratings) {
    const key = lensOf(rating)
    const bucket = lensTotals.get(key)
    if (bucket) {
      bucket.total += rating.ratingValue
      bucket.count += 1
    } else {
      lensTotals.set(key, { total: rating.ratingValue, count: 1 })
    }
  }

  const lensMeanFor = new Map<string, number>()
  for (const [lens, { total, count }] of lensTotals.entries()) {
    lensMeanFor.set(lens, total / count)
  }

  const lensMeans = [...lensTotals.entries()]
    .map(([relationshipType, { total, count }]) => ({
      relationshipType,
      ratingCount: count,
      meanRating: total / count,
    }))
    .sort((a, b) => b.ratingCount - a.ratingCount)

  const byEvaluator = new Map<string, CalibrationRating[]>()
  for (const rating of params.ratings) {
    byEvaluator.set(rating.evaluatorId, [...(byEvaluator.get(rating.evaluatorId) || []), rating])
  }

  const evaluators: EvaluatorCalibration[] = [...byEvaluator.entries()]
    .map(([evaluatorId, evaluatorRatings]) => {
      const meanRating =
        evaluatorRatings.reduce((sum, rating) => sum + rating.ratingValue, 0) /
        evaluatorRatings.length

      // Average of each rating's distance from its own lens mean.
      const deviation =
        evaluatorRatings.reduce(
          (sum, rating) => sum + (rating.ratingValue - (lensMeanFor.get(lensOf(rating)) ?? 0)),
          0
        ) / evaluatorRatings.length

      const ratingsByLens = new Map<string, number[]>()
      for (const rating of evaluatorRatings) {
        const key = lensOf(rating)
        ratingsByLens.set(key, [...(ratingsByLens.get(key) || []), rating.ratingValue])
      }

      // A lens is only scored once it clears the same bar as an evaluator overall;
      // a mean over two ratings swings on a single answer.
      const perLens: LensCalibration[] = [...ratingsByLens.entries()]
        .filter(([lens]) => lens !== UNKNOWN_LENS)
        .map(([relationshipType, values]) => {
          const lensMean = values.reduce((sum, value) => sum + value, 0) / values.length
          return {
            relationshipType,
            ratingCount: values.length,
            meanRating: lensMean,
            deviation: lensMean - (lensMeanFor.get(relationshipType) ?? 0),
            isProvisional: values.length < MIN_RATINGS_FOR_CALIBRATION,
          }
        })
        .sort((a, b) => b.deviation - a.deviation)

      return {
        evaluatorId,
        ratingCount: evaluatorRatings.length,
        meanRating,
        deviation,
        perLens,
        isProvisional: evaluatorRatings.length < MIN_RATINGS_FOR_CALIBRATION,
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
    lensMeans,
    // Lenient to severe, so the full range reads as one spectrum rather than two
    // truncated ends with an invisible middle.
    allEvaluators: [...evaluators].sort((a, b) => b.deviation - a.deviation),
    mostLenient: [...evaluators].sort((a, b) => b.deviation - a.deviation).slice(0, LENIENCY_LIMIT),
    mostSevere: [...evaluators].sort((a, b) => a.deviation - b.deviation).slice(0, LENIENCY_LIMIT),
    evaluatorsAtCap: atCap.size,
    evaluatorsNearCap: nearCap.size,
    insufficientData: false,
  }
}

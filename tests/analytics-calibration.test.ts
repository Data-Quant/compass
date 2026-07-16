import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeCalibration,
  MIN_RATINGS_FOR_CALIBRATION,
  type CalibrationRating,
} from '../lib/analytics/calibration'

function ratings(evaluatorId: string, values: number[]): CalibrationRating[] {
  return values.map((ratingValue) => ({ evaluatorId, ratingValue }))
}

test('computeCalibration ranks evaluators by deviation from the org mean', () => {
  const result = computeCalibration({
    ratings: [...ratings('lenient', [4, 4, 4, 4, 4]), ...ratings('severe', [1, 1, 1, 1, 1])],
    capUsage: [],
    exemptEvaluatorIds: new Set(),
  })

  assert.equal(result.orgMeanRating, 2.5)
  assert.equal(result.mostLenient[0].evaluatorId, 'lenient')
  assert.equal(result.mostLenient[0].deviation, 1.5)
  assert.equal(result.mostSevere[0].evaluatorId, 'severe')
  assert.equal(result.mostSevere[0].deviation, -1.5)
})

test('computeCalibration ignores evaluators below the minimum rating count', () => {
  const result = computeCalibration({
    ratings: [...ratings('busy', [3, 3, 3, 3, 3]), ...ratings('sparse', [4])],
    capUsage: [],
    exemptEvaluatorIds: new Set(),
  })

  const ranked = [...result.mostLenient, ...result.mostSevere].map((entry) => entry.evaluatorId)

  assert.equal(ranked.includes('sparse'), false)
  assert.equal(ranked.includes('busy'), true)
  assert.equal(MIN_RATINGS_FOR_CALIBRATION, 5)
})

test('computeCalibration builds the 1-4 distribution and the share of top ratings', () => {
  const result = computeCalibration({
    ratings: ratings('evaluator-1', [1, 2, 3, 4, 4]),
    capUsage: [],
    exemptEvaluatorIds: new Set(),
  })

  assert.deepEqual(result.distribution, [
    { rating: 1, count: 1 },
    { rating: 2, count: 1 },
    { rating: 3, count: 1 },
    { rating: 4, count: 2 },
  ])
  assert.equal(result.totalRatings, 5)
  assert.equal(result.fourRatingShare, 0.4)
})

test('computeCalibration counts evaluators at and near the cap, excluding exempt ones', () => {
  const result = computeCalibration({
    ratings: ratings('evaluator-1', [4, 4, 4, 4, 4]),
    capUsage: [
      { evaluatorId: 'at-cap', scope: 'PEER', usedFours: 2, maxAllowed: 2 },
      { evaluatorId: 'near-cap', scope: 'PEER', usedFours: 1, maxAllowed: 2 },
      { evaluatorId: 'clear', scope: 'PEER', usedFours: 0, maxAllowed: 2 },
      { evaluatorId: 'exempt-1', scope: 'PEER', usedFours: 9, maxAllowed: 2 },
    ],
    exemptEvaluatorIds: new Set(['exempt-1']),
  })

  assert.equal(result.evaluatorsAtCap, 1)
  // near = usedFours >= maxAllowed - 1, which includes the at-cap evaluator.
  assert.equal(result.evaluatorsNearCap, 2)
})

test('computeCalibration counts an evaluator at cap if any single scope is exhausted', () => {
  const result = computeCalibration({
    ratings: ratings('evaluator-1', [3, 3, 3, 3, 3]),
    capUsage: [
      { evaluatorId: 'multi', scope: 'PEER', usedFours: 0, maxAllowed: 2 },
      { evaluatorId: 'multi', scope: 'TEAM_LEAD', usedFours: 3, maxAllowed: 3 },
    ],
    exemptEvaluatorIds: new Set(),
  })

  assert.equal(result.evaluatorsAtCap, 1)
})

test('computeCalibration flags insufficient data with no ratings', () => {
  const result = computeCalibration({
    ratings: [],
    capUsage: [],
    exemptEvaluatorIds: new Set(),
  })

  assert.equal(result.insufficientData, true)
  assert.equal(result.orgMeanRating, 0)
  assert.equal(result.fourRatingShare, 0)
})

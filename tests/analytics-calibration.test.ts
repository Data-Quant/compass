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

test('a thin rating count is flagged, not hidden', () => {
  // Someone who rated once still rated someone. Dropping them made their number
  // impossible to find from the evaluatee's side, so they are shown and marked.
  const result = computeCalibration({
    ratings: [...ratings('busy', [3, 3, 3, 3, 3]), ...ratings('sparse', [4])],
    capUsage: [],
    exemptEvaluatorIds: new Set(),
  })

  const ids = result.allEvaluators.map((entry) => entry.evaluatorId)
  assert.ok(ids.includes('sparse'), 'a single-rating evaluator should still appear')
  assert.ok(ids.includes('busy'))

  assert.equal(result.allEvaluators.find((e) => e.evaluatorId === 'sparse')!.isProvisional, true)
  assert.equal(result.allEvaluators.find((e) => e.evaluatorId === 'busy')!.isProvisional, false)
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

test('allEvaluators spans the full spectrum, lenient to severe', () => {
  // The UI shows this whole list rather than two five-row ends, so the middle of
  // the distribution stops being invisible.
  const result = computeCalibration({
    ratings: [
      ...ratings('lenient', [4, 4, 4, 4, 4]),
      ...ratings('middle', [3, 3, 2, 3, 2]),
      ...ratings('severe', [1, 1, 1, 1, 1]),
    ],
    capUsage: [],
    exemptEvaluatorIds: new Set(),
  })

  assert.deepEqual(
    result.allEvaluators.map((e) => e.evaluatorId),
    ['lenient', 'middle', 'severe']
  )

  // Descending deviation, with the truncated lists sitting at each end of it.
  for (let i = 1; i < result.allEvaluators.length; i++) {
    assert.ok(result.allEvaluators[i - 1].deviation >= result.allEvaluators[i].deviation)
  }
  assert.equal(result.allEvaluators[0].evaluatorId, result.mostLenient[0].evaluatorId)
  assert.equal(
    result.allEvaluators[result.allEvaluators.length - 1].evaluatorId,
    result.mostSevere[0].evaluatorId
  )
})

test('allEvaluators is empty when there is nothing to calibrate', () => {
  const result = computeCalibration({ ratings: [], capUsage: [], exemptEvaluatorIds: new Set() })

  assert.equal(result.insufficientData, true)
  assert.deepEqual(result.allEvaluators, [])
})

function lensRatings(
  evaluatorId: string,
  relationshipType: string,
  values: number[]
): CalibrationRating[] {
  return values.map((ratingValue) => ({ evaluatorId, ratingValue, relationshipType }))
}

test('deviation is measured within lens, not against one global mean', () => {
  // HR ratings sit far above team-lead ratings company-wide. Against a single
  // global mean the HR evaluator would look lenient and the lead strict purely
  // from which lens they occupy, even though each rates exactly at their own norm.
  const result = computeCalibration({
    ratings: [
      ...lensRatings('hr-a', 'HR', [4, 4, 4, 4, 4]),
      ...lensRatings('hr-b', 'HR', [4, 4, 4, 4, 4]),
      ...lensRatings('lead-a', 'TEAM_LEAD', [2, 2, 2, 2, 2]),
      ...lensRatings('lead-b', 'TEAM_LEAD', [2, 2, 2, 2, 2]),
    ],
    capUsage: [],
    exemptEvaluatorIds: new Set(),
  })

  // Global mean is 3, so a naive calculation would give +1 and -1.
  assert.equal(result.orgMeanRating, 3)
  for (const evaluator of result.allEvaluators) {
    assert.equal(evaluator.deviation, 0, `${evaluator.evaluatorId} should sit at its lens norm`)
  }
})

test('an evaluator strict in one lens and lenient in another is separated', () => {
  const result = computeCalibration({
    ratings: [
      // The subject: harsh as a peer, generous as a lead.
      ...lensRatings('split', 'PEER', [1, 1, 1, 1, 1]),
      ...lensRatings('split', 'TEAM_LEAD', [4, 4, 4, 4, 4]),
      // Context so each lens has a norm above/below them.
      ...lensRatings('peer-norm', 'PEER', [3, 3, 3, 3, 3]),
      ...lensRatings('lead-norm', 'TEAM_LEAD', [2, 2, 2, 2, 2]),
    ],
    capUsage: [],
    exemptEvaluatorIds: new Set(),
  })

  const split = result.allEvaluators.find((e) => e.evaluatorId === 'split')!
  const asPeer = split.perLens.find((entry) => entry.relationshipType === 'PEER')!
  const asLead = split.perLens.find((entry) => entry.relationshipType === 'TEAM_LEAD')!

  assert.ok(asPeer.deviation < 0, 'should read as severe when rating peers')
  assert.ok(asLead.deviation > 0, 'should read as lenient when rating reports')
})

test('a lens with few ratings is scored but flagged', () => {
  const result = computeCalibration({
    ratings: [
      ...lensRatings('sparse', 'PEER', [3, 3, 3, 3, 3]),
      // Two ratings is too few to characterise a lens.
      ...lensRatings('sparse', 'HR', [4, 4]),
      ...lensRatings('other', 'PEER', [2, 2, 2, 2, 2]),
    ],
    capUsage: [],
    exemptEvaluatorIds: new Set(),
  })

  const sparse = result.allEvaluators.find((e) => e.evaluatorId === 'sparse')!
  assert.equal(sparse.perLens.length, 2, 'both lenses appear')

  const hr = sparse.perLens.find((entry) => entry.relationshipType === 'HR')!
  const peer = sparse.perLens.find((entry) => entry.relationshipType === 'PEER')!
  assert.equal(hr.isProvisional, true, 'two ratings is thin')
  assert.equal(peer.isProvisional, false)
})

test('lens means are reported so each baseline is visible', () => {
  const result = computeCalibration({
    ratings: [
      ...lensRatings('a', 'HR', [4, 4, 4, 4, 4]),
      ...lensRatings('b', 'TEAM_LEAD', [2, 2, 2, 2, 2]),
    ],
    capUsage: [],
    exemptEvaluatorIds: new Set(),
  })

  const hr = result.lensMeans.find((entry) => entry.relationshipType === 'HR')!
  const lead = result.lensMeans.find((entry) => entry.relationshipType === 'TEAM_LEAD')!
  assert.equal(hr.meanRating, 4)
  assert.equal(lead.meanRating, 2)
})

test('ratings without a lens still work and share one baseline', () => {
  // Older callers pass no relationshipType; those ratings compare only to each
  // other rather than being silently dropped.
  const result = computeCalibration({
    ratings: [...ratings('lenient', [4, 4, 4, 4, 4]), ...ratings('severe', [1, 1, 1, 1, 1])],
    capUsage: [],
    exemptEvaluatorIds: new Set(),
  })

  assert.equal(result.allEvaluators.find((e) => e.evaluatorId === 'lenient')!.deviation, 1.5)
  assert.equal(result.allEvaluators.find((e) => e.evaluatorId === 'severe')!.deviation, -1.5)
})

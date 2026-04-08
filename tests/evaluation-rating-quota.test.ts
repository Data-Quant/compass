import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEvaluationResponseKey,
  countFourRatingsForResponses,
  getMaxAllowedFourRatings,
  shouldCountAssignmentTowardsFourRatingQuota,
  validateFourRatingQuota,
} from '../lib/evaluation-rating-quota'

test('getMaxAllowedFourRatings keeps the quota at 10 percent with a minimum of one', () => {
  assert.equal(getMaxAllowedFourRatings(0), 0)
  assert.equal(getMaxAllowedFourRatings(6), 1)
  assert.equal(getMaxAllowedFourRatings(10), 1)
  assert.equal(getMaxAllowedFourRatings(29), 2)
  assert.equal(getMaxAllowedFourRatings(30), 3)
})

test('countFourRatingsForResponses counts only rating value 4 responses', () => {
  assert.equal(
    countFourRatingsForResponses([
      { ratingValue: 4 },
      { ratingValue: 3 },
      { ratingValue: 4 },
      { ratingValue: null },
    ]),
    2
  )
})

test('shouldCountAssignmentTowardsFourRatingQuota excludes HR assignments from the quota entirely', () => {
  assert.equal(
    shouldCountAssignmentTowardsFourRatingQuota({
      assignment: {
        evaluatorId: 'hr-b',
        evaluateeId: 'ammar',
        relationshipType: 'HR',
      },
    }),
    false
  )

  assert.equal(
    shouldCountAssignmentTowardsFourRatingQuota({
      assignment: {
        evaluatorId: 'hr-a',
        evaluateeId: 'ammar',
        relationshipType: 'HR',
      },
    }),
    false
  )

  assert.equal(
    shouldCountAssignmentTowardsFourRatingQuota({
      assignment: {
        evaluatorId: 'lead-a',
        evaluateeId: 'ammar',
        relationshipType: 'TEAM_LEAD',
      },
    }),
    true
  )
})

test('validateFourRatingQuota flags submissions that exceed the allowed 4-rating quota', () => {
  assert.deepEqual(
    validateFourRatingQuota({
      totalQuestions: 20,
      usedFourRatings: 1,
      pendingFourRatings: 1,
    }),
    {
      maxAllowedFourRatings: 2,
      nextFourRatings: 2,
      wouldExceed: false,
    }
  )

  assert.deepEqual(
    validateFourRatingQuota({
      totalQuestions: 20,
      usedFourRatings: 1,
      pendingFourRatings: 2,
    }),
    {
      maxAllowedFourRatings: 2,
      nextFourRatings: 3,
      wouldExceed: true,
    }
  )
})

test('buildEvaluationResponseKey scopes a question key to the evaluatee and source', () => {
  assert.equal(
    buildEvaluationResponseKey('ammar', 'LEAD', 'question-1'),
    'ammar:LEAD:question-1'
  )
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDepartmentEvaluationResponseKey,
  buildEvaluationResponseKey,
  countFourRatingsForResponses,
  getFourRatingQuotaScopeType,
  getMaxAllowedFourRatings,
  isExemptFromFourRatingCapByTitle,
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

test('getFourRatingQuotaScopeType groups cross-department evaluations under the peer quota bucket', () => {
  assert.equal(getFourRatingQuotaScopeType('TEAM_LEAD'), 'TEAM_LEAD')
  assert.equal(getFourRatingQuotaScopeType('DIRECT_REPORT'), 'DIRECT_REPORT')
  assert.equal(getFourRatingQuotaScopeType('PEER'), 'PEER')
  assert.equal(getFourRatingQuotaScopeType('CROSS_DEPARTMENT'), 'PEER')
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
        evaluatorId: 'peer-a',
        evaluateeId: 'ammar',
        relationshipType: 'CROSS_DEPARTMENT',
      },
    }),
    true
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

test('isExemptFromFourRatingCapByTitle exempts any partner-level title', () => {
  // Junior Partners and Partners (any "Partner" title) are exempt.
  assert.equal(isExemptFromFourRatingCapByTitle('Partner'), true)
  assert.equal(isExemptFromFourRatingCapByTitle('Junior Partner'), true)
  assert.equal(isExemptFromFourRatingCapByTitle('Principal and Junior Partner'), true)
  assert.equal(isExemptFromFourRatingCapByTitle('Managing Partner'), true)
  // Case- and whitespace-tolerant.
  assert.equal(isExemptFromFourRatingCapByTitle('  junior PARTNER '), true)
  // Non-partner titles are NOT exempt.
  assert.equal(isExemptFromFourRatingCapByTitle('Principal'), false)
  assert.equal(isExemptFromFourRatingCapByTitle('Associate'), false)
  assert.equal(isExemptFromFourRatingCapByTitle('Manager'), false)
  assert.equal(isExemptFromFourRatingCapByTitle(null), false)
  assert.equal(isExemptFromFourRatingCapByTitle(''), false)
})

test('buildEvaluationResponseKey scopes a question key to the evaluatee and source', () => {
  assert.equal(
    buildEvaluationResponseKey('ammar', 'LEAD', 'question-1'),
    'ammar:LEAD:question-1'
  )
})

test('buildDepartmentEvaluationResponseKey scopes a question key to the department pool', () => {
  assert.equal(
    buildDepartmentEvaluationResponseKey('Technology', 'GLOBAL', 'question-1'),
    'DEPT:technology:GLOBAL:question-1'
  )
})

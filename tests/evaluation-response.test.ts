import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isEvaluationResponseComplete,
  normalizeEvaluationTextResponse,
  ratingRequiresExplanation,
} from '../lib/evaluation-response'

test('ratings of 1 and 4 require explanation', () => {
  assert.equal(ratingRequiresExplanation(1), true)
  assert.equal(ratingRequiresExplanation(4), true)
  assert.equal(ratingRequiresExplanation(2), false)
  assert.equal(ratingRequiresExplanation(3), false)
  assert.equal(ratingRequiresExplanation(null), false)
})

test('evaluation response completeness respects rating explanation rules', () => {
  assert.equal(
    isEvaluationResponseComplete({
      questionType: 'RATING',
      ratingValue: 2,
      textResponse: '',
    }),
    true
  )

  assert.equal(
    isEvaluationResponseComplete({
      questionType: 'RATING',
      ratingValue: 1,
      textResponse: '   ',
    }),
    false
  )

  assert.equal(
    isEvaluationResponseComplete({
      questionType: 'RATING',
      ratingValue: 4,
      textResponse: 'Strong business impact.',
    }),
    true
  )
})

test('evaluation explanation text is trimmed before storage', () => {
  assert.equal(normalizeEvaluationTextResponse('  Helpful context  '), 'Helpful context')
  assert.equal(normalizeEvaluationTextResponse('   '), null)
  assert.equal(normalizeEvaluationTextResponse(null), null)
})

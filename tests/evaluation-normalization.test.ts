import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeOverallScorePercent,
  normalizeLensEvaluations,
  type NormalizableEvaluation,
} from '../lib/evaluation-normalization'

function ratingEvaluation(
  evaluatorId: string,
  questionId: string,
  ratingValue: number | null
): NormalizableEvaluation {
  return {
    evaluatorId,
    ratingValue,
    questionId,
    question: { questionText: `q-${questionId}`, maxRating: 4, questionType: 'RATING' },
    leadQuestionId: null,
    leadQuestion: null,
  }
}

test('normalizeLensEvaluations averages each question across evaluators before normalizing', () => {
  // q-1: (4 + 2) / 2 = 3 ; q-2: (3 + 3) / 2 = 3 -> raw 6 of max 8 -> (6/8)*4 = 3
  const result = normalizeLensEvaluations([
    ratingEvaluation('evaluator-1', 'q-1', 4),
    ratingEvaluation('evaluator-2', 'q-1', 2),
    ratingEvaluation('evaluator-1', 'q-2', 3),
    ratingEvaluation('evaluator-2', 'q-2', 3),
  ])

  assert.equal(result.rawScore, 6)
  assert.equal(result.maxScore, 8)
  assert.equal(result.normalizedScore, 3)
  assert.equal(result.evaluatorCount, 2)
})

test('normalizeLensEvaluations ignores null ratings and TEXT questions', () => {
  const textEvaluation: NormalizableEvaluation = {
    evaluatorId: 'evaluator-3',
    ratingValue: null,
    questionId: 'q-text',
    question: { questionText: 'comments', maxRating: 4, questionType: 'TEXT' },
    leadQuestionId: null,
    leadQuestion: null,
  }

  const result = normalizeLensEvaluations([
    ratingEvaluation('evaluator-1', 'q-1', 4),
    ratingEvaluation('evaluator-2', 'q-1', null),
    textEvaluation,
  ])

  // Only evaluator-1's 4 counts: raw 4 of max 4 -> 4
  assert.equal(result.rawScore, 4)
  assert.equal(result.maxScore, 4)
  assert.equal(result.normalizedScore, 4)
  assert.equal(result.evaluatorCount, 1)
})

test('normalizeLensEvaluations returns a zero score when nothing is rateable', () => {
  const result = normalizeLensEvaluations([])

  assert.equal(result.maxScore, 0)
  assert.equal(result.normalizedScore, 0)
  assert.equal(result.evaluatorCount, 0)
})

test('normalizeLensEvaluations supports lead-authored questions at max rating 4', () => {
  const leadEvaluation: NormalizableEvaluation = {
    evaluatorId: 'evaluator-1',
    ratingValue: 2,
    questionId: null,
    question: null,
    leadQuestionId: 'lead-q-1',
    leadQuestion: { questionText: 'lead question', orderIndex: 0 },
  }

  const result = normalizeLensEvaluations([leadEvaluation])

  assert.equal(result.maxScore, 4)
  assert.equal(result.normalizedScore, 2)
})

test('computeOverallScorePercent converts weighted 0-4 contributions to a percentage', () => {
  // (4 * 0.5) + (2 * 0.5) = 3 -> (3 / 4) * 100 = 75
  assert.equal(
    computeOverallScorePercent([
      { normalizedScore: 4, weight: 0.5 },
      { normalizedScore: 2, weight: 0.5 },
    ]),
    75
  )
  assert.equal(computeOverallScorePercent([]), 0)
})

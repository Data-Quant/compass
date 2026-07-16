import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEmployeePeriodScore,
  buildPeriodScoreMatrix,
  type EmployeeScoreInput,
} from '../lib/analytics/period-score-matrix'
import type { NormalizableEvaluation } from '../lib/evaluation-normalization'

function ratingEvaluation(
  evaluatorId: string,
  questionId: string,
  ratingValue: number
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

test('buildEmployeePeriodScore normalizes each lens and weights the overall score', () => {
  const input: EmployeeScoreInput = {
    employeeId: 'emp-1',
    department: 'dept-a',
    evaluationsByLens: {
      C_LEVEL: [ratingEvaluation('evaluator-1', 'q-1', 4)],
      PEER: [ratingEvaluation('evaluator-2', 'q-1', 2)],
    },
    weights: { C_LEVEL: 0.5, PEER: 0.5 },
  }

  const result = buildEmployeePeriodScore(input)

  assert.equal(result.employeeId, 'emp-1')
  assert.equal(result.perLens.C_LEVEL?.normalizedScore, 4)
  assert.equal(result.perLens.PEER?.normalizedScore, 2)
  // (4 * 0.5 + 2 * 0.5) / 4 * 100 = 75
  assert.equal(result.overallScore, 75)
})

test('buildEmployeePeriodScore excludes SELF from the weighted overall score but keeps its lens score', () => {
  const input: EmployeeScoreInput = {
    employeeId: 'emp-1',
    department: 'dept-a',
    evaluationsByLens: {
      C_LEVEL: [ratingEvaluation('evaluator-1', 'q-1', 2)],
      SELF: [ratingEvaluation('emp-1', 'q-1', 4)],
    },
    weights: { C_LEVEL: 1 },
  }

  const result = buildEmployeePeriodScore(input)

  assert.equal(result.perLens.SELF?.normalizedScore, 4)
  // SELF must not contribute: (2 * 1) / 4 * 100 = 50
  assert.equal(result.overallScore, 50)
})

test('buildEmployeePeriodScore ignores lenses with no weight', () => {
  const input: EmployeeScoreInput = {
    employeeId: 'emp-1',
    department: null,
    evaluationsByLens: {
      C_LEVEL: [ratingEvaluation('evaluator-1', 'q-1', 4)],
      HR: [ratingEvaluation('evaluator-2', 'q-1', 1)],
    },
    weights: { C_LEVEL: 1 },
  }

  const result = buildEmployeePeriodScore(input)

  assert.equal(result.perLens.HR?.normalizedScore, 1)
  assert.equal(result.overallScore, 100)
})

test('buildPeriodScoreMatrix maps every employee input into the matrix', () => {
  const matrix = buildPeriodScoreMatrix({
    periodId: 'period-1',
    periodName: 'Q1',
    employees: [
      {
        employeeId: 'emp-1',
        department: 'dept-a',
        evaluationsByLens: { C_LEVEL: [ratingEvaluation('evaluator-1', 'q-1', 4)] },
        weights: { C_LEVEL: 1 },
      },
      {
        employeeId: 'emp-2',
        department: 'dept-b',
        evaluationsByLens: { C_LEVEL: [ratingEvaluation('evaluator-1', 'q-1', 2)] },
        weights: { C_LEVEL: 1 },
      },
    ],
  })

  assert.equal(matrix.periodId, 'period-1')
  assert.equal(matrix.scores.length, 2)
  assert.equal(matrix.scores[0].overallScore, 100)
  assert.equal(matrix.scores[1].overallScore, 50)
})

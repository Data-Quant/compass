import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PRE_EVALUATION_QUESTION_COUNT,
  deriveLeadRelationships,
  derivePreEvaluationStatus,
  validatePreEvaluationSelections,
} from '../lib/pre-evaluation'

test('deriveLeadRelationships builds direct report ownership from TEAM_LEAD rows only', () => {
  const derived = deriveLeadRelationships([
    {
      evaluatorId: 'lead-a',
      evaluateeId: 'report-a',
      relationshipType: 'TEAM_LEAD',
    },
    {
      evaluatorId: 'report-a',
      evaluateeId: 'lead-a',
      relationshipType: 'DIRECT_REPORT',
    },
    {
      evaluatorId: 'lead-b',
      evaluateeId: 'report-b',
      relationshipType: 'TEAM_LEAD',
    },
    {
      evaluatorId: 'peer-a',
      evaluateeId: 'peer-b',
      relationshipType: 'PEER',
    },
  ])

  assert.deepEqual(derived.leadIds, ['lead-a', 'lead-b'])
  assert.deepEqual(derived.directReportsByLead, {
    'lead-a': ['report-a'],
    'lead-b': ['report-b'],
  })
})

test('pre-evaluation question count is now two for team leads', () => {
  assert.equal(PRE_EVALUATION_QUESTION_COUNT, 2)
})

test('derivePreEvaluationStatus completes once lead questions are submitted', () => {
  const status = derivePreEvaluationStatus({
    status: 'PENDING',
    questionsSubmittedAt: new Date('2026-04-01T00:00:00.000Z'),
    evaluateesSubmittedAt: null,
    completedAt: null,
    overdueAt: null,
    overriddenAt: null,
    period: {
      reviewStartDate: new Date('2026-04-20T00:00:00.000Z'),
    },
  })

  assert.equal(status, 'COMPLETED')
})

test('validatePreEvaluationSelections allows change requests for self and direct reports', () => {
  const error = validatePreEvaluationSelections(
    [
      {
        type: 'PEER',
        evaluateeId: 'lead-a',
        suggestedEvaluatorId: 'peer-a',
      },
      {
        type: 'CROSS_DEPARTMENT',
        evaluateeId: 'report-a',
        suggestedEvaluatorId: 'peer-b',
      },
      {
        type: 'PRIMARY',
        evaluateeId: 'report-a',
      },
    ],
    {
      directReportIds: new Set(['report-a']),
      allowedEvaluateeIds: new Set(['lead-a', 'report-a']),
    }
  )

  assert.equal(error, null)
})

test('validatePreEvaluationSelections rejects change requests outside self or direct reports', () => {
  const error = validatePreEvaluationSelections(
    [
      {
        type: 'PEER',
        evaluateeId: 'employee-x',
        suggestedEvaluatorId: 'peer-a',
      },
    ],
    {
      directReportIds: new Set(['report-a']),
      allowedEvaluateeIds: new Set(['lead-a', 'report-a']),
    }
  )

  assert.equal(error, 'Evaluator change requests are only allowed for you or your direct reports')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEvaluationPairKey,
  collapseAssignmentRequirementsByPool,
  filterPooledRelationshipEvaluations,
  getAssignmentCompletionState,
  getHrPoolClosedPairKeys,
} from '../lib/evaluation-completion'

test('HR pool closes every HR pair for an employee once one HR evaluator submits', () => {
  const assignments = [
    { evaluatorId: 'hr-a', evaluateeId: 'ammar', relationshipType: 'HR' as const },
    { evaluatorId: 'hr-b', evaluateeId: 'ammar', relationshipType: 'HR' as const },
    { evaluatorId: 'lead-a', evaluateeId: 'ammar', relationshipType: 'TEAM_LEAD' as const },
  ]

  const closedPairKeys = getHrPoolClosedPairKeys(
    assignments,
    new Set([buildEvaluationPairKey('hr-a', 'ammar')])
  )

  assert.deepEqual(
    [...closedPairKeys].sort(),
    [
      buildEvaluationPairKey('hr-a', 'ammar'),
      buildEvaluationPairKey('hr-b', 'ammar'),
    ]
  )
})

test('HR assignments closed by the pool report complete without a local submission', () => {
  const submittedCounts = new Map([[buildEvaluationPairKey('hr-a', 'ammar'), 4]])
  const hrPoolClosedPairKeys = new Set([
    buildEvaluationPairKey('hr-a', 'ammar'),
    buildEvaluationPairKey('hr-b', 'ammar'),
  ])

  const state = getAssignmentCompletionState({
    assignment: {
      evaluatorId: 'hr-b',
      evaluateeId: 'ammar',
      relationshipType: 'HR',
    },
    questionsCount: 4,
    submittedCounts,
    hrPoolClosedPairKeys,
  })

  assert.equal(state.isClosedByPool, true)
  assert.equal(state.completedCount, 4)
  assert.equal(state.isComplete, true)
})

test('collapseAssignmentRequirementsByPool counts multiple HR mappings as one evaluation slot', () => {
  const collapsed = collapseAssignmentRequirementsByPool([
    {
      evaluatorId: 'hr-a',
      evaluateeId: 'ammar',
      relationshipType: 'HR',
      questionsCount: 4,
      isComplete: true,
    },
    {
      evaluatorId: 'hr-b',
      evaluateeId: 'ammar',
      relationshipType: 'HR',
      questionsCount: 4,
      isComplete: false,
    },
    {
      evaluatorId: 'lead-a',
      evaluateeId: 'ammar',
      relationshipType: 'TEAM_LEAD',
      questionsCount: 6,
      isComplete: false,
    },
  ])

  assert.equal(collapsed.length, 2)
  assert.deepEqual(
    collapsed.find((entry) => entry.questionsCount === 4),
    {
      evaluateeId: 'ammar',
      questionsCount: 4,
      isComplete: true,
    }
  )
})

test('filterPooledRelationshipEvaluations keeps only the first submitted HR evaluator', () => {
  const firstSubmitted = new Date('2026-04-08T10:00:00.000Z')
  const secondSubmitted = new Date('2026-04-08T11:00:00.000Z')
  const filtered = filterPooledRelationshipEvaluations('HR', [
    {
      evaluatorId: 'hr-b',
      evaluateeId: 'ammar',
      submittedAt: secondSubmitted,
    },
    {
      evaluatorId: 'hr-a',
      evaluateeId: 'ammar',
      submittedAt: firstSubmitted,
    },
    {
      evaluatorId: 'hr-a',
      evaluateeId: 'ammar',
      submittedAt: firstSubmitted,
    },
  ])

  assert.equal(filtered.length, 2)
  assert.ok(filtered.every((evaluation) => evaluation.evaluatorId === 'hr-a'))
})

test('non-HR pooled filtering leaves other relationship types untouched', () => {
  const evaluations = [
    {
      evaluatorId: 'lead-a',
      evaluateeId: 'ammar',
      submittedAt: new Date('2026-04-08T10:00:00.000Z'),
    },
    {
      evaluatorId: 'lead-b',
      evaluateeId: 'ammar',
      submittedAt: new Date('2026-04-08T11:00:00.000Z'),
    },
  ]

  assert.deepEqual(filterPooledRelationshipEvaluations('TEAM_LEAD', evaluations), evaluations)
})

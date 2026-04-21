import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveEvaluationAssignments } from '../lib/evaluation-assignments'

test('remove overrides suppress permanent management assignments for the period', () => {
  const assignments = resolveEvaluationAssignments({
    rawMappings: [
      {
        id: 'mapping-1',
        evaluatorId: 'lead-1',
        evaluateeId: 'member-1',
        relationshipType: 'TEAM_LEAD',
      },
    ],
    approvedPeerSelections: [],
    approvedCrossSelections: [],
    periodOverrides: [
      {
        id: 'override-1',
        evaluatorId: 'lead-1',
        evaluateeId: 'member-1',
        relationshipType: 'TEAM_LEAD',
        action: 'REMOVE',
      },
    ],
  })

  assert.equal(assignments.length, 0)
})

test('remove overrides suppress approved period peer selections for the period', () => {
  const assignments = resolveEvaluationAssignments({
    rawMappings: [],
    approvedPeerSelections: [
      {
        id: 'peer-selection-1',
        suggestedEvaluatorId: 'peer-1',
        evaluateeId: 'member-1',
      },
    ],
    approvedCrossSelections: [],
    periodOverrides: [
      {
        id: 'override-1',
        evaluatorId: 'peer-1',
        evaluateeId: 'member-1',
        relationshipType: 'PEER',
        action: 'REMOVE',
      },
    ],
  })

  assert.equal(assignments.length, 0)
})

test('add overrides inject a period-only evaluator assignment', () => {
  const assignments = resolveEvaluationAssignments({
    rawMappings: [],
    approvedPeerSelections: [],
    approvedCrossSelections: [],
    periodOverrides: [
      {
        id: 'override-1',
        evaluatorId: 'cover-lead',
        evaluateeId: 'member-1',
        relationshipType: 'TEAM_LEAD',
        action: 'ADD',
      },
    ],
  })

  assert.equal(assignments.length, 1)
  assert.deepEqual(assignments[0], {
    evaluatorId: 'cover-lead',
    evaluateeId: 'member-1',
    relationshipType: 'TEAM_LEAD',
    source: 'PERIOD_OVERRIDE',
    overrideId: 'override-1',
    evaluator: undefined,
    evaluatee: undefined,
  })
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEvaluationPairKey,
  buildAssignmentTripleKey,
  calculateWeightedEvaluationCompletion,
  filterPooledRelationshipEvaluations,


} from '../lib/evaluation-completion'

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

test('weighted completion gives full credit when all profile slots are complete', () => {
  const completion = calculateWeightedEvaluationCompletion({
    assignments: [
      { evaluatorId: 'direct-a', evaluateeId: 'ammar', relationshipType: 'DIRECT_REPORT' },
      { evaluatorId: 'peer-a', evaluateeId: 'ammar', relationshipType: 'PEER' },
      { evaluatorId: 'peer-b', evaluateeId: 'ammar', relationshipType: 'PEER' },
      { evaluatorId: 'hr-a', evaluateeId: 'ammar', relationshipType: 'HR' },
      { evaluatorId: 'hr-b', evaluateeId: 'ammar', relationshipType: 'HR' },
    ],
    submittedSlots: [
      {
        evaluatorId: 'direct-a',
        evaluateeId: 'ammar',
        relationshipType: 'DIRECT_REPORT',
        submittedAt: new Date('2026-04-24T08:00:00.000Z'),
      },
      {
        evaluatorId: 'peer-a',
        evaluateeId: 'ammar',
        relationshipType: 'PEER',
        submittedAt: new Date('2026-04-24T08:00:00.000Z'),
      },
      {
        evaluatorId: 'peer-b',
        evaluateeId: 'ammar',
        relationshipType: 'PEER',
        submittedAt: new Date('2026-04-24T08:00:00.000Z'),
      },
      {
        evaluatorId: 'hr-a',
        evaluateeId: 'ammar',
        relationshipType: 'HR',
        submittedAt: new Date('2026-04-24T08:00:00.000Z'),
      },
    ],
    weights: { DIRECT_REPORT: 0.25, PEER: 0.65, HR: 0.1 },
  })

  assert.equal(completion.completionPercentage, 100)
  assert.equal(
    completion.breakdown.find((entry) => entry.relationshipType === 'HR')?.requiredSlots,
    1
  )
  assert.deepEqual(completion.pendingSlots, [])
})

test('weighted completion applies partial category progress by profile weight', () => {
  const completion = calculateWeightedEvaluationCompletion({
    assignments: [
      { evaluatorId: 'direct-a', evaluateeId: 'ammar', relationshipType: 'DIRECT_REPORT' },
      { evaluatorId: 'peer-a', evaluateeId: 'ammar', relationshipType: 'PEER' },
      { evaluatorId: 'peer-b', evaluateeId: 'ammar', relationshipType: 'PEER' },
      { evaluatorId: 'hr-a', evaluateeId: 'ammar', relationshipType: 'HR' },
      { evaluatorId: 'hr-b', evaluateeId: 'ammar', relationshipType: 'HR' },
    ],
    submittedSlots: [
      {
        evaluatorId: 'direct-a',
        evaluateeId: 'ammar',
        relationshipType: 'DIRECT_REPORT',
        submittedAt: new Date('2026-04-24T08:00:00.000Z'),
      },
      {
        evaluatorId: 'peer-a',
        evaluateeId: 'ammar',
        relationshipType: 'PEER',
        submittedAt: new Date('2026-04-24T08:00:00.000Z'),
      },
      {
        evaluatorId: 'hr-a',
        evaluateeId: 'ammar',
        relationshipType: 'HR',
        submittedAt: new Date('2026-04-24T08:00:00.000Z'),
      },
    ],
    weights: { DIRECT_REPORT: 0.25, PEER: 0.65, HR: 0.1 },
  })

  assert.equal(completion.completionPercentage, 67.5)
  assert.deepEqual(completion.pendingSlots, [
    {
      evaluatorId: 'peer-b',
      evaluateeId: 'ammar',
      relationshipType: 'PEER',
    },
  ])
})

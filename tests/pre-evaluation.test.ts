import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveLeadRelationships } from '../lib/pre-evaluation'

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

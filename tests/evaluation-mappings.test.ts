import test from 'node:test'
import assert from 'node:assert/strict'
import {
  collapseLogicalMappings,
  countLogicalMappings,
  getInverseRelationshipType,
  normalizeRelationshipTypeForManagement,
} from '../lib/evaluation-mappings'

const alice = { id: 'alice', name: 'Alice', department: 'Product', position: 'Lead' }
const bob = { id: 'bob', name: 'Bob', department: 'Product', position: 'Associate' }
const carol = { id: 'carol', name: 'Carol', department: 'Design', position: 'Designer' }

test('normalizeRelationshipTypeForManagement treats DIRECT_REPORT as TEAM_LEAD input', () => {
  assert.equal(normalizeRelationshipTypeForManagement('DIRECT_REPORT'), 'TEAM_LEAD')
  assert.equal(normalizeRelationshipTypeForManagement('PEER'), 'PEER')
})

test('getInverseRelationshipType returns mirrored relationship pairs', () => {
  assert.equal(getInverseRelationshipType('TEAM_LEAD'), 'DIRECT_REPORT')
  assert.equal(getInverseRelationshipType('DIRECT_REPORT'), 'TEAM_LEAD')
  assert.equal(getInverseRelationshipType('PEER'), 'PEER')
  assert.equal(getInverseRelationshipType('HR'), null)
})

test('collapseLogicalMappings collapses TEAM_LEAD and DIRECT_REPORT into one logical row', () => {
  const collapsed = collapseLogicalMappings([
    {
      id: 'lead-row',
      evaluatorId: 'alice',
      evaluateeId: 'bob',
      relationshipType: 'TEAM_LEAD',
      evaluator: alice,
      evaluatee: bob,
    },
    {
      id: 'report-row',
      evaluatorId: 'bob',
      evaluateeId: 'alice',
      relationshipType: 'DIRECT_REPORT',
      evaluator: bob,
      evaluatee: alice,
    },
  ])

  assert.equal(collapsed.length, 1)
  assert.equal(collapsed[0].relationshipType, 'TEAM_LEAD')
  assert.equal(collapsed[0].evaluatorId, 'alice')
  assert.equal(collapsed[0].evaluateeId, 'bob')
})

test('collapseLogicalMappings collapses mirrored peer rows into a single logical row', () => {
  const collapsed = collapseLogicalMappings([
    {
      id: 'peer-row-1',
      evaluatorId: 'carol',
      evaluateeId: 'bob',
      relationshipType: 'PEER',
      evaluator: carol,
      evaluatee: bob,
    },
    {
      id: 'peer-row-2',
      evaluatorId: 'bob',
      evaluateeId: 'carol',
      relationshipType: 'PEER',
      evaluator: bob,
      evaluatee: carol,
    },
  ])

  assert.equal(collapsed.length, 1)
  assert.equal(collapsed[0].relationshipType, 'PEER')
  assert.equal(countLogicalMappings(collapsed), 1)
})

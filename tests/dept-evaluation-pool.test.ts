import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getDeptPoolDisplayName,
  getDeptPoolKey,
  groupDeptAssignmentsByDepartment,
  pickRepresentativeDeptAssignment,
  selectAuthoritativeDeptPoolEvaluateeId,
  summarizeDeptPool,
} from '../lib/dept-evaluation-pool'

test('groupDeptAssignmentsByDepartment collapses DEPT assignments into one group per department', () => {
  const groups = groupDeptAssignmentsByDepartment([
    {
      evaluatorId: 'hamiz',
      evaluateeId: 'member-a',
      relationshipType: 'DEPT',
      source: 'PERMANENT_MAPPING',
      evaluatee: { id: 'member-a', name: 'Anees', department: 'Technology', position: 'Engineer' },
    },
    {
      evaluatorId: 'hamiz',
      evaluateeId: 'member-b',
      relationshipType: 'DEPT',
      source: 'PERMANENT_MAPPING',
      evaluatee: { id: 'member-b', name: 'Faizan', department: 'Technology', position: 'Analyst' },
    },
    {
      evaluatorId: 'hamiz',
      evaluateeId: 'member-c',
      relationshipType: 'DEPT',
      source: 'PERMANENT_MAPPING',
      evaluatee: { id: 'member-c', name: 'Sarosh', department: 'Strategy', position: 'Lead' },
    },
  ])

  assert.equal(groups.size, 2)
  assert.equal(groups.get(getDeptPoolKey('hamiz', 'Technology'))?.length, 2)
  assert.equal(groups.get(getDeptPoolKey('hamiz', 'Strategy'))?.length, 1)
})

test('pickRepresentativeDeptAssignment chooses the alphabetically earliest team member', () => {
  const representative = pickRepresentativeDeptAssignment([
    {
      evaluatorId: 'hamiz',
      evaluateeId: 'member-b',
      relationshipType: 'DEPT',
      source: 'PERMANENT_MAPPING',
      evaluatee: { id: 'member-b', name: 'Faizan', department: 'Technology', position: 'Analyst' },
    },
    {
      evaluatorId: 'hamiz',
      evaluateeId: 'member-a',
      relationshipType: 'DEPT',
      source: 'PERMANENT_MAPPING',
      evaluatee: { id: 'member-a', name: 'Anees', department: 'Technology', position: 'Engineer' },
    },
  ])

  assert.equal(representative.evaluateeId, 'member-a')
})

test('summarizeDeptPool produces the department label and member count', () => {
  const summary = summarizeDeptPool([
    {
      evaluatorId: 'hamiz',
      evaluateeId: 'member-a',
      relationshipType: 'DEPT',
      source: 'PERMANENT_MAPPING',
      evaluatee: { id: 'member-a', name: 'Anees', department: 'Technology', position: 'Engineer' },
    },
    {
      evaluatorId: 'hamiz',
      evaluateeId: 'member-b',
      relationshipType: 'DEPT',
      source: 'PERMANENT_MAPPING',
      evaluatee: { id: 'member-b', name: 'Faizan', department: 'Technology', position: 'Analyst' },
    },
  ])

  assert.equal(summary.department, 'Technology')
  assert.equal(summary.departmentKey, 'technology')
  assert.equal(summary.label, getDeptPoolDisplayName('Technology'))
  assert.equal(summary.memberCount, 2)
})

test('selectAuthoritativeDeptPoolEvaluateeId prefers the most complete saved department record', () => {
  const sourceEvaluateeId = selectAuthoritativeDeptPoolEvaluateeId({
    evaluateeIds: ['member-a', 'member-b'],
    evaluations: [
      {
        evaluateeId: 'member-a',
        ratingValue: 4,
        textResponse: null,
        updatedAt: new Date('2026-04-22T10:00:00.000Z'),
      },
      {
        evaluateeId: 'member-b',
        ratingValue: 4,
        textResponse: null,
        updatedAt: new Date('2026-04-22T09:00:00.000Z'),
      },
      {
        evaluateeId: 'member-b',
        ratingValue: 3,
        textResponse: 'More complete',
        updatedAt: new Date('2026-04-22T11:00:00.000Z'),
      },
    ],
  })

  assert.equal(sourceEvaluateeId, 'member-b')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getMappingConstraint,
  isNoIncomingEvaluationName,
  shouldReceiveConstantEvaluations,
} from '../lib/evaluation-profile-rules'

test('no-incoming evaluator names are recognized case-insensitively', () => {
  assert.equal(isNoIncomingEvaluationName('Brad Herman'), true)
  assert.equal(isNoIncomingEvaluationName(' maryam   khalil '), true)
  assert.equal(isNoIncomingEvaluationName('Richard Reizes'), true)
  assert.equal(isNoIncomingEvaluationName('Amal Majjout'), false)
})

test('excluded leaders can lead others without creating a mirrored direct-report row', () => {
  const usersById = new Map([
    ['lead', { id: 'lead', name: 'Brad Herman', department: 'Operating Partner-Value Creation' }],
    ['report', { id: 'report', name: 'Areebah Akhlaque', department: 'HR' }],
  ])

  const constraint = getMappingConstraint(
    {
      evaluatorId: 'lead',
      evaluateeId: 'report',
      relationshipType: 'TEAM_LEAD',
    },
    usersById
  )

  assert.equal(constraint.blocked, false)
  assert.equal(constraint.skipManagementMirror, true)
})

test('excluded people cannot receive incoming management or peer evaluations', () => {
  const usersById = new Map([
    ['lead', { id: 'lead', name: 'Amal Majjout', department: 'Operating Partner-Value Creation' }],
    ['excluded', { id: 'excluded', name: 'Daniyal Awan', department: 'Executive' }],
  ])

  const teamLeadConstraint = getMappingConstraint(
    {
      evaluatorId: 'lead',
      evaluateeId: 'excluded',
      relationshipType: 'TEAM_LEAD',
    },
    usersById
  )
  assert.equal(teamLeadConstraint.blocked, true)

  const peerConstraint = getMappingConstraint(
    {
      evaluatorId: 'lead',
      evaluateeId: 'excluded',
      relationshipType: 'PEER',
    },
    usersById
  )
  assert.equal(peerConstraint.blocked, true)
})

test('constant evaluators are disabled for excluded names and 3E users', () => {
  assert.equal(
    shouldReceiveConstantEvaluations({ name: 'Hamiz Awan', department: 'Executive' }),
    false
  )
  assert.equal(
    shouldReceiveConstantEvaluations({ name: 'Richard Reizes', department: 'Executive' }),
    false
  )
  assert.equal(
    shouldReceiveConstantEvaluations({ name: 'Ali Example', department: '3E' }),
    false
  )
  assert.equal(
    shouldReceiveConstantEvaluations({ name: 'Amal Majjout', department: 'Operating Partner-Value Creation' }),
    true
  )
})

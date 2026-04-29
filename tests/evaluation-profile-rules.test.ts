import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getMappingConstraint,
  isNoIncomingEvaluationName,
  shouldReceiveConstantEvaluations,
  shouldReceiveReportForPeriod,
} from '../lib/evaluation-profile-rules'

test('no-incoming evaluator names are recognized case-insensitively', () => {
  assert.equal(isNoIncomingEvaluationName('Brad Herman'), true)
  assert.equal(isNoIncomingEvaluationName(' maryam   khalil '), true)
  assert.equal(isNoIncomingEvaluationName('Richard Reizes'), true)
  assert.equal(isNoIncomingEvaluationName('Amal Majjout'), false)
})

test('period report eligibility requires an incoming mapping', () => {
  const employee = {
    id: 'employee',
    name: 'Anees Iqbal',
    department: 'Technology',
    position: 'Associate-Backend Engineer',
  }
  const juniorPartner = {
    id: 'junior-partner',
    name: 'Ammar Hassan',
    department: 'Technology',
    position: 'Junior Partner',
  }
  const partner = {
    id: 'partner',
    name: 'Partner Example',
    department: 'Executive',
    position: 'Partner',
  }

  assert.equal(
    shouldReceiveReportForPeriod(employee, [
      { evaluateeId: 'employee' },
      { evaluateeId: 'other' },
    ]),
    true
  )
  assert.equal(shouldReceiveReportForPeriod(employee, [{ evaluateeId: 'other' }]), false)
  assert.equal(
    shouldReceiveReportForPeriod(juniorPartner, [{ evaluateeId: 'junior-partner' }]),
    true
  )
  assert.equal(shouldReceiveReportForPeriod(partner, [{ evaluateeId: 'partner' }]), false)
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

test('constant evaluators are disabled for excluded names, exact partner titles, and 3E users', () => {
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
    shouldReceiveConstantEvaluations({
      name: 'Amal Majjout',
      department: 'Operating Partner-Value Creation',
    }),
    true
  )
  assert.equal(
    shouldReceiveConstantEvaluations({
      name: 'Operating Partner Example',
      department: 'Executive',
      position: 'Operating Partner',
    }),
    true
  )
  assert.equal(
    shouldReceiveConstantEvaluations({
      name: 'Ammar Hassan',
      department: 'Technology',
      position: 'Junior Partner',
    }),
    true
  )
  assert.equal(
    shouldReceiveConstantEvaluations({
      name: 'Tahir Example',
      department: 'Operations',
      position: 'Principal and Junior Partner',
    }),
    true
  )
  assert.equal(
    shouldReceiveConstantEvaluations({
      name: 'Partner Example',
      department: 'Executive',
      position: 'Partner',
    }),
    false
  )
  assert.equal(
    shouldReceiveConstantEvaluations({
      name: 'Anees Iqbal',
      department: 'Technology',
      position: 'Associate-Backend Engineer',
    }),
    true
  )
})

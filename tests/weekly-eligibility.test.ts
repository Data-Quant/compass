import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateeExclusion, evaluatorExclusion, type PersonFacts } from '../lib/weekly/eligibility'
import { NO_INCOMING_EVALUATION_NAMES } from '../lib/evaluation-profile-rules'
import { bankForPerspective, isFormRelationshipType, perspectiveForBank, perspectiveOf } from '../lib/weekly/perspectives'

const now = new Date('2026-10-20T08:00:00.000Z')
const weekOne = new Date('2026-10-04T19:00:00.000Z')
const person = (overrides: Partial<PersonFacts> = {}): PersonFacts => ({
  id: 'p', name: 'Pat Doe', department: 'Product', position: 'Analyst', payrollActive: true, exitDate: null, joiningDate: null, ...overrides,
})
const ctx = { now, weekOneStartsOn: weekOne, totalWeeks: 13, optedIn: false }

test('relationship types map to perspectives and question banks', () => {
  assert.equal(perspectiveOf('TEAM_LEAD'), 'LEAD')
  assert.equal(perspectiveOf('DIRECT_REPORT'), 'UPWARD')
  assert.equal(perspectiveOf('PEER'), 'PEER')
  assert.equal(perspectiveOf('CROSS_DEPARTMENT'), 'PEER')
  assert.equal(perspectiveOf('HR'), null)
  assert.equal(bankForPerspective('LEAD'), 'DIRECT_REPORT')
  assert.equal(bankForPerspective('UPWARD'), 'TEAM_LEAD')
  assert.equal(perspectiveForBank('TEAM_LEAD'), 'UPWARD')
  assert.equal(perspectiveForBank('C_LEVEL'), null)
  assert.equal(isFormRelationshipType('DEPT'), true)
  assert.equal(isFormRelationshipType('PEER'), false)
})

test('people outside the scheme are never evaluated', () => {
  assert.equal(evaluateeExclusion(person({ name: NO_INCOMING_EVALUATION_NAMES[0] }), ctx), 'NOT_EVALUATED')
  assert.equal(evaluateeExclusion(person({ position: 'Partner' }), ctx), 'NOT_EVALUATED')
  assert.equal(evaluateeExclusion(person({ department: '3E' }), ctx), 'NOT_EVALUATED')
  assert.equal(evaluateeExclusion(person(), ctx), null)
})

test('leavers neither evaluate nor get evaluated', () => {
  assert.equal(evaluateeExclusion(person({ payrollActive: false }), ctx), 'INACTIVE')
  assert.equal(evaluateeExclusion(person({ exitDate: new Date('2026-10-15T00:00:00.000Z') }), ctx), 'LEFT')
  assert.equal(evaluateeExclusion(person({ exitDate: new Date('2026-11-30T00:00:00.000Z') }), ctx), null)
  assert.equal(evaluatorExclusion(person({ payrollActive: false }), now), 'INACTIVE')
  assert.equal(evaluatorExclusion(person({ exitDate: new Date('2026-10-15T00:00:00.000Z') }), now), 'LEFT')
  assert.equal(evaluatorExclusion(person(), now), null)
})

test('late joiners are left out unless HR opts them in', () => {
  const late = person({ joiningDate: new Date('2026-11-16T05:00:00.000Z') })
  assert.equal(evaluateeExclusion(late, ctx), 'JOINED_LATE')
  assert.equal(evaluateeExclusion(late, { ...ctx, optedIn: true }), null)
})

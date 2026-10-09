import test from 'node:test'
import assert from 'node:assert/strict'
import { EXCLUSION_LABELS, evaluateeExclusion, evaluatorExclusion, isOutsideRedesign, type PersonFacts } from '../lib/weekly/eligibility'
import { NO_INCOMING_EVALUATION_NAMES } from '../lib/evaluation-profile-rules'
import { bankForPerspective, isFormRelationshipType, perspectiveForBank, perspectiveOf, RELATIONSHIP_WORDS, type Perspective } from '../lib/weekly/perspectives'

const now = new Date('2026-10-20T08:00:00.000Z')
const weekOne = new Date('2026-10-04T19:00:00.000Z')
const person = (overrides: Partial<PersonFacts> = {}): PersonFacts => ({
  id: 'p', name: 'Pat Doe', department: 'Product', position: 'Analyst', payrollActive: true, exitDate: null, joiningDate: null, ...overrides,
})
const ctx = { now, opensAt: weekOne, optedIn: false }

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

test('anyone who joined after the round opened is left out both ways, unless HR opts them in (section 7)', () => {
  const late = person({ joiningDate: new Date('2026-10-12T05:00:00.000Z') })
  assert.equal(evaluateeExclusion(late, ctx), 'JOINED_LATE')
  assert.equal(evaluatorExclusion(late, now, { opensAt: weekOne, optedIn: false }), 'JOINED_LATE')
  assert.equal(evaluateeExclusion(late, { ...ctx, optedIn: true }), null)
  assert.equal(evaluatorExclusion(late, now, { opensAt: weekOne, optedIn: true }), null)
  const before = person({ joiningDate: new Date('2026-09-01T05:00:00.000Z') })
  assert.equal(evaluateeExclusion(before, ctx), null)
  assert.equal(evaluatorExclusion(before, now, { opensAt: weekOne, optedIn: false }), null)
})

test('3E is outside the redesign entirely: never asked, never asking, never listed', () => {
  const threeE = person({ department: '3E' })
  assert.equal(isOutsideRedesign(threeE), true)
  assert.equal(isOutsideRedesign(person({ department: ' 3e ' })), true)
  assert.equal(isOutsideRedesign(person()), false)
  assert.equal(evaluatorExclusion(threeE, now), 'NOT_EVALUATED')
  assert.equal(EXCLUSION_LABELS.NOT_EVALUATED.includes('3E'), false)
})

test('each question says the relationship in words, from the evaluator’s side (section 8)', () => {
  assert.equal(RELATIONSHIP_WORDS[perspectiveOf('TEAM_LEAD') as Perspective], 'you are their lead')
  assert.equal(RELATIONSHIP_WORDS[perspectiveOf('DIRECT_REPORT') as Perspective], 'they are your lead')
  assert.equal(RELATIONSHIP_WORDS[perspectiveOf('PEER') as Perspective], 'you are their peer')
})

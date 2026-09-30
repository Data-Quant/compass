import test from 'node:test'
import assert from 'node:assert/strict'
import { EXCLUSION_LABELS, evaluateeExclusion, evaluatorExclusion, isOutsideRedesign, type PersonFacts } from '../lib/weekly/eligibility'
import { NO_INCOMING_EVALUATION_NAMES } from '../lib/evaluation-profile-rules'
import { bankForPerspective, isFormRelationshipType, perspectiveForBank, perspectiveOf, type Perspective } from '../lib/weekly/perspectives'
import { findDraft } from '../lib/weekly/content/drafts'

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

test('3E is outside the redesign entirely: never asked, never asking, never listed', () => {
  const threeE = person({ department: '3E' })
  assert.equal(isOutsideRedesign(threeE), true)
  assert.equal(isOutsideRedesign(person({ department: ' 3e ' })), true)
  assert.equal(isOutsideRedesign(person()), false)
  assert.equal(evaluatorExclusion(threeE, now), 'NOT_EVALUATED')
  assert.equal(EXCLUSION_LABELS.NOT_EVALUATED.includes('3E'), false)
})

test('every rewritten bank question maps to its spec topic, except the one the spec has no topic for', () => {
  const cases: Array<[Perspective, string, string | null]> = [
    ['LEAD', "Does this team member's output reflect careful thinking, attention to details, and a standard they would be proud to put their name on, or does their work require frequent correction and follow-up?", 'LEAD.QUALITY_OF_WORK'],
    ['LEAD', 'Does this team member make the people around them more effective or do gaps in communication create friction, confusion, or extra work for others?', 'LEAD.TEAM_COLLABORATION'],
    ['LEAD', 'When this team member commits to a deadline, does the team feel confident it will be met, and if something changes, do they own it proactively?', 'LEAD.INITIATIVE'],
    ['UPWARD', 'When your lead assigns you a task or project, do they give you what you need to execute it well and make it meaningful?', 'UPWARD.CLARITY'],
    ['UPWARD', 'Has your lead ever pushed you toward something out of your comfort zone because they believed in your potential?', 'UPWARD.GROWTH_SUPPORT'],
    ['UPWARD', 'Does your lead create an environment where you feel both supported and challenged?', 'UPWARD.RECOGNITION'],
    ['UPWARD', 'When things go wrong, a missed target, a team conflict, an impossible deadline does your lead make the situation better or do they become part of the problem?', 'UPWARD.LEADERSHIP'],
    ['PEER', 'When you needed your peer to show up, on a deadline, in a tough moment, or on a shared commitment, did they, and what did that tell you about working with them?', 'PEER.RELIABILITY'],
    ['PEER', "When there's a disagreement or tension between you, does your peer handle it in a way that makes the working relationship stronger?", 'PEER.COMMUNICATION'],
    ['PEER', "When your peer hands something over, a document, a deliverable, a response, do you trust that it's been thought through, or do you find yourself checking their work?", 'PEER.COLLABORATION'],
    ['PEER', 'Does your peer find ways around obstacles that others accept as blockers?', null],
  ]
  for (const [perspective, text, key] of cases) assert.equal(findDraft(perspective, text)?.key ?? null, key, text)
})

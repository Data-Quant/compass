import test from 'node:test'
import assert from 'node:assert/strict'
import { isAudienceEmpty, parseAudience, resolveAudience, type DirectoryPerson } from '../lib/security-checks/audience'
import { complianceStats, repeatExpiredUserIds } from '../lib/security-checks/compliance'
import { isCompliant, nonCompliantQuestions, sanitizeAnswers, unansweredQuestions, type QuestionDef } from '../lib/security-checks/answers'

const people: DirectoryPerson[] = [
  { id: 'a', department: 'Engineering', teamTag: 'PAKISTAN', active: true },
  { id: 'b', department: ' engineering ', teamTag: 'MOROCCO', active: true },
  { id: 'c', department: 'Design', teamTag: 'MOROCCO', active: true },
  { id: 'd', department: 'Design', teamTag: 'PAKISTAN', active: false },
  { id: 'e', department: null, teamTag: null, active: true },
]

test('audience: whole company minus exclusions, active people only', () => {
  assert.deepEqual(resolveAudience(parseAudience({ all: true, excludeUserIds: ['e'] }), people), ['a', 'b', 'c'])
})

test('audience: departments (case/space-insensitive), teams and individuals combine', () => {
  assert.deepEqual(resolveAudience(parseAudience({ departments: ['Engineering'] }), people), ['a', 'b'])
  assert.deepEqual(resolveAudience(parseAudience({ teams: ['MOROCCO'] }), people), ['b', 'c'])
  assert.deepEqual(resolveAudience(parseAudience({ userIds: ['e', 'd'] }), people), ['e'])
  assert.deepEqual(resolveAudience(parseAudience({ departments: ['design'], userIds: ['a'], excludeUserIds: ['c'] }), people), ['a'])
})

test('audience: malformed rules resolve to nobody', () => {
  const rules = parseAudience({ all: 'yes' })
  assert.ok(isAudienceEmpty(rules))
  assert.deepEqual(resolveAudience(rules, people), [])
})

test('compliance % excludes N/A, Exempt and Cancelled from numerator and denominator', () => {
  const stats = complianceStats([
    { status: 'VERIFIED', submitted: true },
    { status: 'VERIFIED', submitted: true },
    { status: 'EXPIRED', submitted: false },
    { status: 'PENDING_REVIEW', submitted: true },
    { status: 'NOT_APPLICABLE', submitted: true },
    { status: 'EXEMPT', submitted: false },
    { status: 'CANCELLED', submitted: false },
  ])
  assert.equal(stats.inScope, 4)
  assert.equal(stats.excluded, 3)
  assert.equal(stats.compliancePct, 50)
  assert.equal(stats.completionPct, 75)
  assert.equal(complianceStats([{ status: 'EXEMPT', submitted: false }]).compliancePct, null)
})

test('employees with ≥2 consecutive Expired tasks in a campaign are flagged', () => {
  const flagged = repeatExpiredUserIds(
    new Map([
      ['u1', [{ cycleNumber: 1, status: 'EXPIRED' }, { cycleNumber: 2, status: 'EXPIRED' }]],
      ['u2', [{ cycleNumber: 1, status: 'EXPIRED' }, { cycleNumber: 2, status: 'VERIFIED' }]],
      ['u3', [{ cycleNumber: 3, status: 'EXPIRED' }]],
    ] as const),
  )
  assert.deepEqual(flagged, ['u1'])
})

const questions: QuestionDef[] = [
  { id: 'q1', type: 'YES_NO', prompt: 'Is MFA on?', compliantAnswer: true },
  { id: 'q2', type: 'ACCOUNT_IDENTIFIER', prompt: 'Account email', compliantAnswer: null },
  { id: 'q3', type: 'SHORT_TEXT', prompt: 'Notes', compliantAnswer: null },
]

test('answers are sanitised to known questions and correct types', () => {
  const answers = sanitizeAnswers(questions, { q1: 'yes', q2: '  me@example.test ', q3: '', extra: true })
  assert.deepEqual(answers, { q2: 'me@example.test' })
  assert.deepEqual(unansweredQuestions(questions, answers).map((q) => q.id), ['q1', 'q3'])
  assert.deepEqual(sanitizeAnswers(questions, ['q1']), {})
})

test('a Yes/No answer differing from the compliant answer is non-compliant', () => {
  assert.ok(isCompliant(questions, { q1: true }))
  assert.deepEqual(nonCompliantQuestions(questions, { q1: false }).map((q) => q.id), ['q1'])
  assert.ok(!isCompliant(questions, { q1: false, q2: 'x' }))
})

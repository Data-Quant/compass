import test from 'node:test'
import assert from 'node:assert/strict'
import { afterNotObserved, canEditSubmitted, choiceProblem, commentProblem, evaluatorStatus } from '../lib/weekly/answer-rules'

test('a choice scoring 1, 1.5 or 4 needs a note; any other choice does not', () => {
  assert.match(choiceProblem({ score: 4, note: null }) ?? '', /note/)
  assert.match(choiceProblem({ score: 1.5, note: '   ' }) ?? '', /note/)
  assert.equal(choiceProblem({ score: 1, note: 'Missed two handovers.' }), null)
  assert.equal(choiceProblem({ score: 2.5, note: null }), null)
})

test('comments are optional but cannot be submitted empty', () => {
  assert.match(commentProblem('  ') ?? '', /skip/)
  assert.equal(commentProblem('Keep sharing plans early.'), null)
})

test('an answer can be edited until the Sunday of the week it was given, and never once the quarter is locked', () => {
  // Week 1 runs Monday 5 October to Sunday 11 October 2026, Karachi time.
  const weekOneStartsOn = new Date('2026-10-04T19:00:00.000Z')
  const submittedAt = new Date('2026-10-06T08:00:00.000Z')
  const rule = (now: string, periodLocked = false) => canEditSubmitted({ submittedAt, periodLocked, weekOneStartsOn, now: new Date(now) })
  assert.equal(rule('2026-10-11T18:59:00.000Z'), true, 'Sunday 23:59 in Karachi')
  assert.equal(rule('2026-10-11T19:00:00.000Z'), false, 'Monday 00:00 in Karachi')
  assert.equal(rule('2026-10-07T08:00:00.000Z', true), false)
  assert.equal(canEditSubmitted({ submittedAt: null, periodLocked: false, weekOneStartsOn, now: submittedAt }), false)
})

test('not observed snoozes three weeks, and a second time closes the slot', () => {
  assert.deepEqual(afterNotObserved(0, 4), { status: 'OPEN', snoozedUntilWeek: 7, notObservedCount: 1 })
  assert.deepEqual(afterNotObserved(1, 8), { status: 'CLOSED_NOT_OBSERVED', snoozedUntilWeek: null, notObservedCount: 2 })
})

test('evaluators see whether they answered, never a score', () => {
  assert.deepEqual(['OPEN', 'DRAFT', 'SUBMITTED', 'NOT_OBSERVED', 'EXPIRED', 'CANCELLED'].map(evaluatorStatus), ['OPEN', 'DRAFT', 'SUBMITTED', 'NOT_OBSERVED', 'EXPIRED', 'CANCELLED'])
})

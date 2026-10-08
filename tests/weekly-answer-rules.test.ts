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

test('a submitted answer can be edited until HR locks the quarter', () => {
  const submittedAt = new Date('2026-10-06T08:00:00.000Z')
  assert.equal(canEditSubmitted({ submittedAt, periodLocked: false }), true)
  assert.equal(canEditSubmitted({ submittedAt, periodLocked: true }), false)
  assert.equal(canEditSubmitted({ submittedAt: null, periodLocked: false }), false)
})

test('not observed snoozes three weeks, and a second time closes the slot', () => {
  assert.deepEqual(afterNotObserved(0, 4), { status: 'OPEN', snoozedUntilWeek: 7, notObservedCount: 1 })
  assert.deepEqual(afterNotObserved(1, 8), { status: 'CLOSED_NOT_OBSERVED', snoozedUntilWeek: null, notObservedCount: 2 })
})

test('evaluators see whether they answered, never a score', () => {
  assert.deepEqual(['OPEN', 'DRAFT', 'SUBMITTED', 'NOT_OBSERVED', 'EXPIRED', 'CANCELLED'].map(evaluatorStatus), ['OPEN', 'DRAFT', 'SUBMITTED', 'NOT_OBSERVED', 'EXPIRED', 'CANCELLED'])
})

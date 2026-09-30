import test from 'node:test'
import assert from 'node:assert/strict'
import {
  afterNotObserved, answerProblem, answerWordCount, canEditSubmitted, commentProblem, countWords, evaluatorStatus,
} from '../lib/weekly/answer-rules'
import { isConfirmedAction, latestByResponse } from '../lib/weekly/reviews'
import { syntheticAnswer, syntheticComment } from '../lib/weekly/content/synthetic'

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')

test('answers need all three boxes, with no minimum number of words', () => {
  assert.equal(countWords('  one  two\nthree '), 3)
  assert.equal(countWords(null), 0)
  assert.equal(answerProblem({ situation: '', action: 'x', result: 'y' }), 'Describe the situation')
  assert.equal(answerProblem({ situation: 'x', action: ' ', result: 'y' }), 'Add what they did')
  assert.equal(answerProblem({ situation: 'x', action: 'y', result: '' }), 'Add what happened as a result')
  assert.equal(answerProblem({ situation: 'a', action: 'b', result: 'c' }), null)
  assert.equal(answerProblem({ situation: words(10), action: words(10), result: words(10) }), null)
  assert.equal(answerWordCount({ situation: words(20), action: words(10), result: words(10), shortfall: words(50) }), 40)
})

test('comments are optional but cannot be submitted empty', () => {
  assert.equal(commentProblem('  '), 'Write a comment, or skip it')
  assert.equal(commentProblem('Keep going.'), null)
})

test('a submitted answer can be edited for 24 hours unless HR already reviewed it', () => {
  const submittedAt = new Date('2026-10-06T08:00:00.000Z')
  assert.equal(canEditSubmitted({ submittedAt, reviewedByHuman: false, now: new Date('2026-10-07T07:59:00.000Z') }), true)
  assert.equal(canEditSubmitted({ submittedAt, reviewedByHuman: false, now: new Date('2026-10-07T08:01:00.000Z') }), false)
  assert.equal(canEditSubmitted({ submittedAt, reviewedByHuman: true, now: new Date('2026-10-06T09:00:00.000Z') }), false)
  assert.equal(canEditSubmitted({ submittedAt: null, reviewedByHuman: false, now: submittedAt }), false)
})

test('not observed snoozes three weeks, and a second time closes the slot', () => {
  assert.deepEqual(afterNotObserved(0, 4), { status: 'OPEN', snoozedUntilWeek: 7, notObservedCount: 1 })
  assert.deepEqual(afterNotObserved(1, 8), { status: 'CLOSED_NOT_OBSERVED', snoozedUntilWeek: null, notObservedCount: 2 })
})

test('evaluators see only accepted or add-detail, never a score (D13)', () => {
  assert.equal(evaluatorStatus({ promptStatus: 'OPEN', latestReviewAction: null, aiInsufficient: false }), 'OPEN')
  assert.equal(evaluatorStatus({ promptStatus: 'SUBMITTED', latestReviewAction: null, aiInsufficient: false }), 'BEING_REVIEWED')
  assert.equal(evaluatorStatus({ promptStatus: 'SUBMITTED', latestReviewAction: null, aiInsufficient: true }), 'ADD_DETAIL')
  assert.equal(evaluatorStatus({ promptStatus: 'SUBMITTED', latestReviewAction: 'ADJUSTED', aiInsufficient: false }), 'ACCEPTED')
  assert.equal(evaluatorStatus({ promptStatus: 'SUBMITTED', latestReviewAction: 'AUTO_ACCEPTED', aiInsufficient: false }), 'ACCEPTED')
  assert.equal(evaluatorStatus({ promptStatus: 'SUBMITTED', latestReviewAction: 'MARKED_INSUFFICIENT', aiInsufficient: false }), 'ADD_DETAIL')
  assert.equal(evaluatorStatus({ promptStatus: 'SUBMITTED', latestReviewAction: 'EXCLUDED', aiInsufficient: false }), 'NOT_USED')
  assert.equal(evaluatorStatus({ promptStatus: 'NOT_OBSERVED', latestReviewAction: null, aiInsufficient: false }), 'NOT_OBSERVED')
})

test('the latest review per answer decides, and only confirming actions count', () => {
  const at = (s: string) => new Date(`2026-10-10T${s}:00.000Z`)
  const latest = latestByResponse([
    { id: '1', responseId: 'r1', createdAt: at('08:00'), action: 'MARKED_INSUFFICIENT' },
    { id: '2', responseId: 'r1', createdAt: at('09:00'), action: 'ACCEPTED' },
    { id: '3', responseId: 'r2', createdAt: at('08:00'), action: 'EXCLUDED' },
  ])
  assert.equal(latest.get('r1')?.action, 'ACCEPTED')
  assert.equal(isConfirmedAction('ACCEPTED'), true)
  assert.equal(isConfirmedAction('MANUAL'), true)
  assert.equal(isConfirmedAction('EXCLUDED'), false)
  assert.equal(isConfirmedAction(null), false)
})

test('synthetic answers are deterministic and pass the answer rules', () => {
  const first = syntheticAnswer('prompt-1', 'Reliability')
  assert.deepEqual(syntheticAnswer('prompt-1', 'Reliability'), first)
  for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']) {
    const answer = syntheticAnswer(seed, 'Quality of Work')
    assert.equal(answerProblem(answer), null, `${seed} (${answer.quality})`)
  }
  assert.ok(syntheticComment('x').length > 10)
})

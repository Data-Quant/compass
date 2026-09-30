import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAggregateRows, pairKey } from '../lib/weekly/aggregation'
import { categoryKey, closeBlockers, dropCandidates, formsAreOpen, hasBlockers, RELATIONSHIP_TYPES_BY_PERSPECTIVE } from '../lib/weekly/close-rules'
import { addWorkingDays } from '../lib/weekly/working-days'

test('the challenge window counts working days, skipping weekends and public holidays', () => {
  const published = new Date('2026-12-30T04:00:00.000Z') // Wednesday 30 Dec, 09:00 Karachi
  assert.equal(addWorkingDays(published, 10, []).toISOString(), '2027-01-13T18:59:59.999Z')
  assert.equal(addWorkingDays(published, 10, [{ year: 2027, month: 1, day: 1 }]).toISOString(), '2027-01-14T18:59:59.999Z')
})

test('scoring, failed and unreviewed answers block the close; others do not', () => {
  const blockers = closeBlockers(['SCORING', 'FAILED', 'FAILED', 'NEEDS_REVIEW', 'AUTO_ACCEPT_PENDING', 'INSUFFICIENT', 'DECIDED'])
  assert.deepEqual(blockers, { scoring: 1, failed: 2, needsReview: 1 })
  assert.equal(hasBlockers(blockers), true)
  assert.equal(hasBlockers(closeBlockers(['DECIDED', 'INSUFFICIENT', 'AUTO_ACCEPT_PENDING'])), false)
})

test('a group with no accepted evidence can be dropped; the peer group covers cross-department assignments', () => {
  const categories = [
    { evaluateeId: 'ana', perspective: 'LEAD' as const },
    { evaluateeId: 'ana', perspective: 'PEER' as const },
    { evaluateeId: 'ben', perspective: 'PEER' as const },
  ]
  const confirmed = new Map([[categoryKey('ana', 'LEAD'), 2], [categoryKey('ben', 'PEER'), 0]])
  assert.deepEqual(dropCandidates(categories, confirmed), [{ evaluateeId: 'ana', perspective: 'PEER' }, { evaluateeId: 'ben', perspective: 'PEER' }])
  assert.deepEqual([...RELATIONSHIP_TYPES_BY_PERSPECTIVE.PEER], ['PEER', 'CROSS_DEPARTMENT'])
})

test('forms open in the catch-up weeks or once HR opens them, and only while the cycle runs', () => {
  const base = { status: 'RUNNING', formsOpenAt: null, totalWeeks: 13, now: new Date('2026-12-01T00:00:00.000Z') }
  assert.equal(formsAreOpen({ ...base, week: 11 }), false)
  assert.equal(formsAreOpen({ ...base, week: 12 }), true)
  assert.equal(formsAreOpen({ ...base, week: 3, formsOpenAt: new Date('2026-11-30T00:00:00.000Z') }), true)
  assert.equal(formsAreOpen({ ...base, week: 3, formsOpenAt: new Date('2026-12-02T00:00:00.000Z') }), false)
  assert.equal(formsAreOpen({ ...base, week: 12, status: 'CLOSED' }), false)
})

test('aggregation: one row per evaluator, person and question with the mean score; comments; leavers get nothing', () => {
  const { rows, counts } = buildAggregateRows({
    scores: [
      { evaluatorId: 'lead', evaluateeId: 'ana', questionId: 'q1', leadQuestionId: null, score: 4 },
      { evaluatorId: 'lead', evaluateeId: 'ana', questionId: 'q1', leadQuestionId: null, score: 3 },
      { evaluatorId: 'lead', evaluateeId: 'ana', questionId: null, leadQuestionId: 'lq', score: 2 },
      { evaluatorId: 'ben', evaluateeId: 'ana', questionId: null, leadQuestionId: null, score: 3 },
      { evaluatorId: 'ana', evaluateeId: 'gone', questionId: 'q2', leadQuestionId: null, score: 2 },
    ],
    comments: [
      { evaluatorId: 'lead', evaluateeId: 'ana', questionId: 't1', text: '  Keep sharing plans early.  ' },
      { evaluatorId: 'lead', evaluateeId: 'ana', questionId: 't2', text: '   ' },
    ],
    excludedEvaluateeIds: new Set(['gone']),
    manualPairs: new Set(),
  })
  assert.deepEqual(rows, [
    { evaluatorId: 'lead', evaluateeId: 'ana', questionId: 'q1', leadQuestionId: null, ratingValue: 3.5, textResponse: null },
    { evaluatorId: 'lead', evaluateeId: 'ana', questionId: null, leadQuestionId: 'lq', ratingValue: 2, textResponse: null },
    { evaluatorId: 'lead', evaluateeId: 'ana', questionId: 't1', leadQuestionId: null, ratingValue: null, textResponse: 'Keep sharing plans early.' },
  ])
  assert.deepEqual(counts, { ratingRows: 2, commentRows: 1, evaluatees: 1, skippedNoQuestion: 1, excludedEvaluatees: 1, skippedManualPairs: 0, clearedClassicDrafts: 0 })
})

test('a pair with classic answers keeps them: its weekly scores and comments are skipped; other pairs are written', () => {
  const { rows, counts } = buildAggregateRows({
    scores: [
      { evaluatorId: 'lead', evaluateeId: 'ana', questionId: 'q1', leadQuestionId: null, score: 3 },
      { evaluatorId: 'ben', evaluateeId: 'ana', questionId: 'q2', leadQuestionId: null, score: 2 },
    ],
    comments: [{ evaluatorId: 'lead', evaluateeId: 'ana', questionId: 't1', text: 'A strong quarter.' }],
    excludedEvaluateeIds: new Set(),
    manualPairs: new Set([pairKey({ evaluatorId: 'lead', evaluateeId: 'ana' })]),
  })
  assert.deepEqual(rows.map((r) => `${r.evaluatorId}>${r.evaluateeId}:${r.questionId}`), ['ben>ana:q2'])
  assert.deepEqual([counts.skippedManualPairs, counts.ratingRows, counts.commentRows], [1, 1, 0])
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { categoryCoverage, type CoverageSlot } from '../lib/weekly/coverage'
import { evaluatorDrift, pearson, qualityReport, type QualityRow } from '../lib/weekly/quality'
import { answerState, isAutoAcceptDue, isSampled, reviewReasons, type AnswerStateInput } from '../lib/weekly/review-rules'

const ai = (overrides: Partial<{ sufficiency: string; score: number | null; confidence: string; flags: string[] }> = {}) => ({
  sufficiency: 'SUFFICIENT', score: 3, confidence: 'HIGH', flags: [] as string[], ...overrides,
})
const unsampled = Array.from({ length: 200 }, (_, i) => `r${i}`).find((id) => !isSampled(id))!
const t = (minute: number) => new Date(Date.UTC(2026, 9, 5, 4, minute))

test('answer states follow the job, the latest AI score and the reviews made after it', () => {
  const base: AnswerStateInput = { responseId: unsampled, job: { status: 'DONE', updatedAt: t(1) }, aiScore: { ...ai(), createdAt: t(1) }, latestReview: null, humanReviewedBefore: false }
  assert.deepEqual(answerState({ ...base, job: { status: 'RUNNING', updatedAt: t(0) } }), { state: 'SCORING', reasons: [] })
  assert.deepEqual(answerState(base), { state: 'AUTO_ACCEPT_PENDING', reasons: [] })
  assert.equal(answerState({ ...base, latestReview: { createdAt: t(2) } }).state, 'DECIDED')
  assert.equal(answerState({ ...base, latestReview: { createdAt: t(0) } }).state, 'AUTO_ACCEPT_PENDING')
  assert.deepEqual(answerState({ ...base, aiScore: { ...ai({ score: 4 }), createdAt: t(1) } }), { state: 'NEEDS_REVIEW', reasons: ['EXTREME_SCORE'] })
  assert.equal(answerState({ ...base, aiScore: { ...ai({ sufficiency: 'INSUFFICIENT', score: null }), createdAt: t(1) } }).state, 'INSUFFICIENT')
  const failed: AnswerStateInput = { ...base, job: { status: 'FAILED', updatedAt: t(5) }, aiScore: null }
  assert.deepEqual(answerState(failed), { state: 'FAILED', reasons: ['SCORING_FAILED'] })
  assert.equal(answerState({ ...failed, latestReview: { createdAt: t(4) } }).state, 'FAILED')
  assert.equal(answerState({ ...failed, latestReview: { createdAt: t(6) } }).state, 'DECIDED')
  assert.deepEqual(answerState({ ...base, humanReviewedBefore: true, latestReview: { createdAt: t(0) } }), { state: 'NEEDS_REVIEW', reasons: ['CORRECTED'] })
  assert.equal(answerState({ ...base, job: null, aiScore: null }).state, 'SCORING')
})

test('HR reviews 1s, 4s, low confidence and any flag; thin answers skip review', () => {
  assert.deepEqual(reviewReasons(ai({ score: 4 }), unsampled), ['EXTREME_SCORE'])
  assert.deepEqual(reviewReasons(ai({ score: 1, confidence: 'LOW', flags: ['OFF_TOPIC'] }), unsampled), ['EXTREME_SCORE', 'LOW_CONFIDENCE', 'FLAGGED'])
  assert.deepEqual(reviewReasons(ai(), unsampled), [])
  assert.deepEqual(reviewReasons(ai({ sufficiency: 'INSUFFICIENT', score: null }), unsampled), [])
})

test('about one in ten of the rest is sampled, the same way every time', () => {
  const ids = Array.from({ length: 2000 }, (_, i) => `response-${i}`)
  const share = ids.filter(isSampled).length / ids.length
  assert.ok(share > 0.05 && share < 0.15, `sampled ${share}`)
  const sampled = ids.find(isSampled)!
  assert.deepEqual(reviewReasons(ai(), sampled), ['SAMPLED'])
  assert.equal(isSampled(sampled), true)
})

test('auto-accept waits 72 hours', () => {
  const scoredAt = new Date('2026-10-05T04:00:00.000Z')
  assert.equal(isAutoAcceptDue(scoredAt, new Date('2026-10-08T03:59:00.000Z')), false)
  assert.equal(isAutoAcceptDue(scoredAt, new Date('2026-10-08T04:00:00.000Z')), true)
})

test('coverage counts satisfied topics per person and group, and flags low evidence', () => {
  const slot = (evaluatorId: string, status: string, perspective: CoverageSlot['perspective'] = 'PEER'): CoverageSlot => ({ evaluateeId: 'ana', evaluatorId, perspective, status })
  const rows = categoryCoverage([
    slot('ben', 'SATISFIED'), slot('ben', 'SATISFIED'), slot('ben', 'OPEN'), slot('cara', 'CLOSED_NOT_OBSERVED'), slot('cara', 'CANCELLED'),
    slot('lead', 'OPEN', 'LEAD'),
  ])
  const peer = rows.find((r) => r.perspective === 'PEER')!
  assert.deepEqual([peer.satisfied, peer.total, peer.evaluatorsContributing, peer.lowEvidence], [2, 4, 1, true])
  const lead = rows.find((r) => r.perspective === 'LEAD')!
  assert.deepEqual([lead.satisfied, lead.total, lead.lowEvidence], [0, 1, true])
  const good = categoryCoverage([slot('ben', 'SATISFIED'), slot('cara', 'SATISFIED'), slot('ben', 'SATISFIED'), slot('cara', 'OPEN')])
  assert.equal(good[0].lowEvidence, false)
})

test('quality: agreement, adjustments, length bias, flags, 4s and drift', () => {
  assert.equal(pearson([1, 2, 3], [2, 4, 6]), 1)
  assert.equal(pearson([1, 1, 1], [1, 2, 3]), null)
  const row = (aiScore: number | null, finalScore: number | null, human: boolean, words: number, extra: Partial<QualityRow> = {}): QualityRow => ({
    aiScore, finalScore, humanReviewed: human, wordCount: words, flags: [], topic: 'Reliability', perspective: 'PEER', evaluatorId: 'ben', tokens: 100, ...extra,
  })
  const report = qualityReport([row(3, 3, true, 50), row(4, 3, true, 80, { flags: ['GENERIC_PRAISE'] }), row(2, 2, false, 60), row(null, null, false, 45)])
  assert.equal(report.scored, 3)
  assert.equal(report.reviewedByHuman, 2)
  assert.equal(report.exactAgreement, 0.5)
  assert.equal(report.withinOneAgreement, 1)
  assert.deepEqual(report.adjustmentsByTopic, [{ topic: 'Reliability', adjusted: 1, reviewed: 2 }])
  assert.equal(report.flagCounts.GENERIC_PRAISE, 1)
  assert.equal(report.foursShare.PEER, 0)
  assert.equal(report.tokens, 400)
  // Group mean is 7/3 ≈ 2.33: the harsh evaluator sits 1.33 below it, the others 0.67 above (under the 0.75 threshold).
  const drift = evaluatorDrift([
    ...['a', 'b', 'c'].map(() => ({ evaluatorId: 'harsh', perspective: 'PEER' as const, finalScore: 1 })),
    ...['a', 'b', 'c'].map(() => ({ evaluatorId: 'fair', perspective: 'PEER' as const, finalScore: 3 })),
    ...['a', 'b', 'c'].map(() => ({ evaluatorId: 'kind', perspective: 'PEER' as const, finalScore: 3 })),
  ])
  assert.deepEqual(drift.map((d) => d.evaluatorId), ['harsh'])
  assert.ok(drift[0].difference < -1)
  assert.deepEqual(evaluatorDrift([{ evaluatorId: 'solo', perspective: 'LEAD', finalScore: 4 }, { evaluatorId: 'solo', perspective: 'LEAD', finalScore: 4 }, { evaluatorId: 'solo', perspective: 'LEAD', finalScore: 4 }]), [])
})

test('a sensitive thin answer goes to HR instead of a follow-up; a corrected answer comes back to HR whatever its new score', () => {
  const base: AnswerStateInput = { responseId: unsampled, job: { status: 'DONE', updatedAt: t(1) }, aiScore: null, latestReview: null, humanReviewedBefore: false }
  const thinSensitive = { ...ai({ sufficiency: 'INSUFFICIENT', score: null, flags: ['GENERIC_PRAISE', 'SENSITIVE_CONTENT'] }), createdAt: t(1) }
  assert.deepEqual(reviewReasons(thinSensitive, unsampled), ['FLAGGED'])
  assert.deepEqual(answerState({ ...base, aiScore: thinSensitive }), { state: 'NEEDS_REVIEW', reasons: ['FLAGGED'] })
  const thinPraise = { ...ai({ sufficiency: 'INSUFFICIENT', score: null, flags: ['GENERIC_PRAISE'] }), createdAt: t(1) }
  assert.deepEqual(answerState({ ...base, aiScore: thinPraise }), { state: 'INSUFFICIENT', reasons: [] })
  assert.deepEqual(answerState({ ...base, aiScore: thinPraise, humanReviewedBefore: true }), { state: 'NEEDS_REVIEW', reasons: ['CORRECTED'] })
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agreement, CALIBRATION_MIN_ITEMS, costUsd, gateResult, isValidModelId, parsePrices, parseSummary, summarizeCalibration, type CalibrationRow,
} from '../lib/weekly/calibration-rules'

const S = (score: number) => ({ sufficiency: 'SUFFICIENT', score })
const I = { sufficiency: 'INSUFFICIENT', score: null }
const NONE = { sufficiency: null, score: null }
const row = (target: CalibrationRow['target'], ai: CalibrationRow['ai'], overrides: Partial<CalibrationRow> = {}): CalibrationRow => ({
  topic: 'Quality', target, ai, error: null, inputTokens: 100, outputTokens: 10, latencyMs: 200, ...overrides,
})

test('agreement: both insufficient, or both sufficient with the same score (exact) or one apart (within one)', () => {
  assert.deepEqual(agreement(I, I), { exact: true, withinOne: true })
  assert.deepEqual(agreement(S(3), S(3)), { exact: true, withinOne: true })
  assert.deepEqual(agreement(S(3), S(2)), { exact: false, withinOne: true })
  assert.deepEqual(agreement(S(4), S(2)), { exact: false, withinOne: false })
  assert.deepEqual(agreement(S(2), I), { exact: false, withinOne: false })
  assert.deepEqual(agreement(I, S(1)), { exact: false, withinOne: false })
})

test('only Fireworks model ids are accepted', () => {
  assert.equal(isValidModelId('accounts/fireworks/models/llama-v3p1-70b-instruct'), true)
  assert.equal(isValidModelId('accounts/my-team/models/qwen2.5_72b'), true)
  for (const bad of ['stand-in', 'gpt-4o', 'accounts/Fireworks/models/x', 'accounts/fireworks/models/', 'accounts/fireworks/models/x y', 'accounts/a/models/b/c']) {
    assert.equal(isValidModelId(bad), false, bad)
  }
})

test('cost is tokens × the model’s price per million; an unknown price gives null; no tokens cost nothing', () => {
  assert.equal(costUsd({ inputTokens: 1_000_000, outputTokens: 500_000 }, { inputPerMillion: 0.9, outputPerMillion: 2 }), 1.9)
  assert.equal(costUsd({ inputTokens: 10, outputTokens: 1 }, undefined), null)
  assert.equal(costUsd({ inputTokens: 0, outputTokens: 0 }, undefined), 0)
  assert.deepEqual(
    parsePrices({ a: { inputPerMillion: 1, outputPerMillion: 2 }, b: { inputPerMillion: -1, outputPerMillion: 2 }, c: 'x' }),
    { a: { inputPerMillion: 1, outputPerMillion: 2 } },
  )
  assert.deepEqual(parsePrices(null), {})
})

test('the summary counts errors apart from agreement and breaks agreement down by topic', () => {
  const rows = [
    row(S(3), S(3)), row(S(3), S(2)), row(I, I, { topic: 'Ownership' }), row(S(2), S(4), { topic: 'Ownership' }),
    row(S(2), NONE, { error: 'TIMEOUT', inputTokens: 0, outputTokens: 0, latencyMs: 0 }),
  ]
  const summary = summarizeCalibration(rows, { inputPerMillion: 1, outputPerMillion: 2 })
  assert.deepEqual(
    [summary.items, summary.compared, summary.errors, summary.exact, summary.withinOne, summary.exactRate, summary.withinOneRate],
    [5, 4, 1, 2, 3, 0.5, 0.75],
  )
  assert.deepEqual([summary.inputTokens, summary.outputTokens, summary.costUsd, summary.avgLatencyMs, summary.failure], [400, 40, 0.00048, 200, null])
  assert.deepEqual(summary.byTopic, [
    { topic: 'Ownership', compared: 2, exact: 1, withinOne: 1 },
    { topic: 'Quality', compared: 2, exact: 1, withinOne: 2 },
  ])
  assert.deepEqual(parseSummary(JSON.parse(JSON.stringify(summary))), summary)
  assert.equal(parseSummary({ items: 'x' }), null)
})

test('the trust gate needs 40 scored items, errors on at most 5%, 90% within one and 70% exact', () => {
  const rows = (exact: number, withinOnly: number, off: number, errors: number) => [
    ...Array.from({ length: exact }, () => row(S(3), S(3))),
    ...Array.from({ length: withinOnly }, () => row(S(3), S(2))),
    ...Array.from({ length: off }, () => row(S(4), S(1))),
    ...Array.from({ length: errors }, () => row(S(3), NONE, { error: 'PROVIDER_ERROR' })),
  ]
  const gate = (exact: number, withinOnly: number, off: number, errors: number) => gateResult(summarizeCalibration(rows(exact, withinOnly, off, errors), undefined))
  assert.deepEqual(gate(28, 8, 4, 0), { passed: true, reasons: [] }) // exactly 70% exact and 90% within one of 40
  assert.equal(gate(28, 8, 4, 2).passed, true) // 2 errors of 42 items is under 5%
  assert.equal(gate(27, 9, 4, 0).passed, false) // 67.5% exact
  assert.equal(gate(28, 7, 5, 0).passed, false) // 87.5% within one
  assert.match(gate(20, 5, 0, 0).reasons[0], new RegExp(`at least ${CALIBRATION_MIN_ITEMS}`))
  assert.ok(gate(38, 2, 0, 3).reasons.some((reason) => /^Errors on/.test(reason))) // 3 errors of 43 items
  assert.equal(gateResult(summarizeCalibration(rows(40, 0, 0, 0), undefined, 'The model is not available')).passed, false)
})

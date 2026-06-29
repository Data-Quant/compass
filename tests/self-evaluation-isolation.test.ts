import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_WEIGHTS, calculateRedistributedWeights } from '../lib/config'

test('SELF carries zero weight so self-evaluations never affect scores', () => {
  assert.equal(DEFAULT_WEIGHTS.SELF, 0)
})

test('calculateRedistributedWeights never assigns weight to SELF even when present', () => {
  const weights = calculateRedistributedWeights(['TEAM_LEAD', 'PEER', 'SELF'])
  assert.equal(weights.SELF ?? 0, 0)
  // The non-SELF weights should redistribute to sum to ~1 (SELF excluded entirely)
  const total = Object.values(weights).reduce((s, v) => s + v, 0)
  assert.ok(Math.abs(total - 1) < 1e-6, `expected redistributed weights to sum to 1, got ${total}`)
})

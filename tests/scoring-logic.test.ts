import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateRedistributedWeights, DEFAULT_WEIGHTS } from '../lib/config'
import { toCategorySetKey, DEFAULT_WEIGHTAGES, RELATIONSHIP_TYPE_LABELS, CSV_CATEGORY_MAP } from '../types'

// ─── toCategorySetKey ────────────────────────────────────────────────────────

test('toCategorySetKey sorts types alphabetically', () => {
  const key = toCategorySetKey(['PEER', 'C_LEVEL', 'TEAM_LEAD'])
  assert.equal(key, 'C_LEVEL,PEER,TEAM_LEAD')
})

test('toCategorySetKey filters out SELF', () => {
  const key = toCategorySetKey(['PEER', 'SELF', 'HR'])
  assert.equal(key, 'HR,PEER')
})

test('toCategorySetKey returns empty string for only SELF', () => {
  const key = toCategorySetKey(['SELF'])
  assert.equal(key, '')
})

test('toCategorySetKey handles all types', () => {
  const key = toCategorySetKey(['DIRECT_REPORT', 'TEAM_LEAD', 'PEER', 'C_LEVEL', 'HR', 'DEPT', 'SELF'])
  assert.equal(key, 'C_LEVEL,DEPT,DIRECT_REPORT,HR,PEER,TEAM_LEAD')
})

test('toCategorySetKey handles empty array', () => {
  const key = toCategorySetKey([])
  assert.equal(key, '')
})

test('toCategorySetKey is deterministic regardless of input order', () => {
  const key1 = toCategorySetKey(['PEER', 'C_LEVEL', 'HR'])
  const key2 = toCategorySetKey(['HR', 'PEER', 'C_LEVEL'])
  const key3 = toCategorySetKey(['C_LEVEL', 'HR', 'PEER'])
  assert.equal(key1, key2)
  assert.equal(key2, key3)
})

// ─── DEFAULT_WEIGHTAGES ──────────────────────────────────────────────────────

test('DEFAULT_WEIGHTAGES sum to 1.0 (excluding SELF)', () => {
  const sum = Object.entries(DEFAULT_WEIGHTAGES)
    .filter(([k]) => k !== 'SELF')
    .reduce((acc, [, v]) => acc + v, 0)
  assert.ok(Math.abs(sum - 1.0) < 0.0001, `Sum was ${sum}, expected 1.0`)
})

test('DEFAULT_WEIGHTAGES SELF is zero', () => {
  assert.equal(DEFAULT_WEIGHTAGES.SELF, 0.00)
})

test('all relationship types have labels', () => {
  const types: string[] = ['DIRECT_REPORT', 'TEAM_LEAD', 'PEER', 'C_LEVEL', 'HR', 'DEPT', 'SELF']
  for (const type of types) {
    assert.ok(
      type in RELATIONSHIP_TYPE_LABELS,
      `Missing label for ${type}`
    )
    assert.ok(
      RELATIONSHIP_TYPE_LABELS[type as keyof typeof RELATIONSHIP_TYPE_LABELS].length > 0,
      `Empty label for ${type}`
    )
  }
})

// ─── calculateRedistributedWeights ───────────────────────────────────────────

test('calculateRedistributedWeights with all types sums to 1.0', () => {
  const types = ['C_LEVEL', 'TEAM_LEAD', 'DIRECT_REPORT', 'PEER', 'HR', 'DEPT']
  const weights = calculateRedistributedWeights(types)
  const sum = Object.values(weights).reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(sum - 1.0) < 0.0001, `Sum was ${sum}`)
})

test('calculateRedistributedWeights proportionally redistributes when types missing', () => {
  const types = ['C_LEVEL', 'TEAM_LEAD'] // missing PEER, DIRECT_REPORT, HR, DEPT
  const weights = calculateRedistributedWeights(types)

  // Should only have the requested types
  assert.ok(!('PEER' in weights), 'Should not include PEER')
  assert.ok(!('DIRECT_REPORT' in weights), 'Should not include DIRECT_REPORT')

  // Should sum to 1.0
  const sum = Object.values(weights).reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(sum - 1.0) < 0.0001, `Sum was ${sum}`)

  // C_LEVEL should have higher weight than TEAM_LEAD (ratio preserved)
  assert.ok(weights.C_LEVEL > weights.TEAM_LEAD, 'C_LEVEL should be > TEAM_LEAD')
})

test('calculateRedistributedWeights excludes SELF even if provided', () => {
  const types = ['PEER', 'SELF', 'HR']
  const weights = calculateRedistributedWeights(types)
  assert.ok(!('SELF' in weights), 'SELF should not appear in output')
  const sum = Object.values(weights).reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(sum - 1.0) < 0.0001, `Sum was ${sum}`)
})

test('calculateRedistributedWeights handles single type', () => {
  const weights = calculateRedistributedWeights(['PEER'])
  assert.equal(Object.keys(weights).length, 1)
  assert.ok(Math.abs(weights.PEER - 1.0) < 0.0001, 'Single type should get 100%')
})

test('calculateRedistributedWeights handles empty array', () => {
  const weights = calculateRedistributedWeights([])
  assert.equal(Object.keys(weights).length, 0)
})

test('calculateRedistributedWeights preserves relative proportions', () => {
  const types = ['C_LEVEL', 'PEER'] // 0.35 vs 0.10
  const weights = calculateRedistributedWeights(types)

  // Original ratio was 3.5:1, redistributed should maintain this
  const ratio = weights.C_LEVEL / weights.PEER
  const originalRatio = DEFAULT_WEIGHTS.C_LEVEL / DEFAULT_WEIGHTS.PEER
  assert.ok(
    Math.abs(ratio - originalRatio) < 0.001,
    `Ratio was ${ratio}, expected ${originalRatio}`
  )
})

// ─── CSV_CATEGORY_MAP ────────────────────────────────────────────────────────

test('CSV_CATEGORY_MAP maps all expected CSV categories', () => {
  assert.equal(CSV_CATEGORY_MAP['Lead'], 'TEAM_LEAD')
  assert.equal(CSV_CATEGORY_MAP['Team Lead'], 'TEAM_LEAD')
  assert.equal(CSV_CATEGORY_MAP['Direct Reports (Team Member)'], 'DIRECT_REPORT')
  assert.equal(CSV_CATEGORY_MAP['Peer'], 'PEER')
  assert.equal(CSV_CATEGORY_MAP['HR'], 'HR')
  assert.equal(CSV_CATEGORY_MAP['Hamiz'], 'C_LEVEL')
  assert.equal(CSV_CATEGORY_MAP['Dept'], 'DEPT')
})

// ─── DEFAULT_WEIGHTS (config) consistency with types ─────────────────────────

test('DEFAULT_WEIGHTS in config matches DEFAULT_WEIGHTAGES in types', () => {
  for (const [key, value] of Object.entries(DEFAULT_WEIGHTS)) {
    assert.ok(
      key in DEFAULT_WEIGHTAGES,
      `Key ${key} in config but not in types`
    )
    assert.ok(
      Math.abs(value - DEFAULT_WEIGHTAGES[key as keyof typeof DEFAULT_WEIGHTAGES]) < 0.0001,
      `Mismatch for ${key}: config=${value}, types=${DEFAULT_WEIGHTAGES[key as keyof typeof DEFAULT_WEIGHTAGES]}`
    )
  }
})

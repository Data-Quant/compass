import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeConsensus,
  computeTalentGrid,
  MOMENTUM_DEAD_BAND,
} from '../lib/analytics/talent-grid'
import type { EmployeePeriodScore, PeriodScoreMatrix } from '../lib/analytics/period-score-matrix'

function score(
  employeeId: string,
  overallScore: number,
  perLens: EmployeePeriodScore['perLens'] = {}
): EmployeePeriodScore {
  return { employeeId, department: 'dept-a', overallScore, perLens, weights: {} }
}

function matrix(periodId: string, scores: EmployeePeriodScore[]): PeriodScoreMatrix {
  return { periodId, periodName: periodId, scores }
}

test('computeConsensus inverts the external lens spread onto a 0-1 scale', () => {
  // spread = 4 - 2 = 2 -> 1 - 2/4 = 0.5
  assert.equal(
    computeConsensus({
      C_LEVEL: { normalizedScore: 4, evaluatorCount: 1 },
      PEER: { normalizedScore: 2, evaluatorCount: 1 },
    }),
    0.5
  )
  // Perfect agreement -> 1
  assert.equal(
    computeConsensus({
      C_LEVEL: { normalizedScore: 3, evaluatorCount: 1 },
      PEER: { normalizedScore: 3, evaluatorCount: 1 },
    }),
    1
  )
})

test('computeConsensus excludes SELF and needs at least two external lenses', () => {
  assert.equal(
    computeConsensus({
      C_LEVEL: { normalizedScore: 4, evaluatorCount: 1 },
      SELF: { normalizedScore: 0, evaluatorCount: 1 },
    }),
    null
  )
  assert.equal(computeConsensus({}), null)
})

test('computeTalentGrid buckets performance into cohort-relative tertiles', () => {
  const current = matrix('p2', [score('emp-1', 10), score('emp-2', 50), score('emp-3', 90)])

  const result = computeTalentGrid({ current, comparison: null })
  const bands = new Map(result.entries.map((entry) => [entry.employeeId, entry.performanceBand]))

  assert.equal(bands.get('emp-1'), 'LOW')
  assert.equal(bands.get('emp-2'), 'MID')
  assert.equal(bands.get('emp-3'), 'HIGH')
})

test('computeTalentGrid treats a delta inside the dead band as stable', () => {
  const comparison = matrix('p1', [score('emp-1', 50), score('emp-2', 50), score('emp-3', 50)])
  const current = matrix('p2', [
    score('emp-1', 50 + MOMENTUM_DEAD_BAND), // exactly at the band -> STABLE
    score('emp-2', 50 + MOMENTUM_DEAD_BAND + 0.1), // just beyond -> RISING
    score('emp-3', 50 - MOMENTUM_DEAD_BAND - 0.1), // just beyond -> DECLINING
  ])

  const result = computeTalentGrid({ current, comparison })
  const bands = new Map(result.entries.map((entry) => [entry.employeeId, entry.momentumBand]))

  assert.equal(bands.get('emp-1'), 'STABLE')
  assert.equal(bands.get('emp-2'), 'RISING')
  assert.equal(bands.get('emp-3'), 'DECLINING')
})

test('computeTalentGrid marks employees without a prior score as new', () => {
  const comparison = matrix('p1', [score('emp-1', 50)])
  const current = matrix('p2', [score('emp-1', 50), score('emp-2', 70)])

  const result = computeTalentGrid({ current, comparison })
  const newEntry = result.entries.find((entry) => entry.employeeId === 'emp-2')

  assert.equal(newEntry?.isNew, true)
  assert.equal(newEntry?.momentumDelta, null)
  assert.equal(newEntry?.momentumBand, null)
  assert.equal(newEntry?.cellLabel, null)
})

test('computeTalentGrid labels the nine cells', () => {
  const comparison = matrix('p1', [score('emp-1', 90), score('emp-2', 50), score('emp-3', 10)])
  const current = matrix('p2', [
    score('emp-1', 90), // HIGH + STABLE
    score('emp-2', 60), // MID + RISING
    score('emp-3', 0), // LOW + DECLINING
  ])

  const result = computeTalentGrid({ current, comparison })
  const labels = new Map(result.entries.map((entry) => [entry.employeeId, entry.cellLabel]))

  assert.equal(labels.get('emp-1'), 'Top performer')
  assert.equal(labels.get('emp-2'), 'Emerging')
  assert.equal(labels.get('emp-3'), 'At-risk')
})

test('computeTalentGrid flags insufficient data without a comparison period', () => {
  const result = computeTalentGrid({ current: matrix('p1', [score('emp-1', 50)]), comparison: null })

  assert.equal(result.insufficientData, true)
  assert.equal(result.entries[0].momentumBand, null)
})

test('computeTalentGrid puts everyone in MID when the cohort is too small to split', () => {
  const result = computeTalentGrid({
    current: matrix('p1', [score('emp-1', 10), score('emp-2', 90)]),
    comparison: null,
  })

  assert.deepEqual(
    result.entries.map((entry) => entry.performanceBand),
    ['MID', 'MID']
  )
})

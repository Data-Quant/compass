import test from 'node:test'
import assert from 'node:assert/strict'
import { BLIND_SPOT_FLAG_LIMIT, computeBlindSpots } from '../lib/analytics/blind-spots'
import type { EmployeePeriodScore, PeriodScoreMatrix } from '../lib/analytics/period-score-matrix'

function employee(
  employeeId: string,
  perLens: EmployeePeriodScore['perLens'],
  weights: Record<string, number>
): EmployeePeriodScore {
  return { employeeId, department: 'dept-a', overallScore: 0, perLens, weights }
}

function lens(normalizedScore: number) {
  return { normalizedScore, evaluatorCount: 1 }
}

test('computeBlindSpots computes the self gap against a weighted others score', () => {
  const matrix: PeriodScoreMatrix = {
    periodId: 'p1',
    periodName: 'Q1',
    scores: [
      employee(
        'emp-1',
        { C_LEVEL: lens(2), PEER: lens(4), SELF: lens(4) },
        { C_LEVEL: 0.5, PEER: 0.5 }
      ),
    ],
  }

  const result = computeBlindSpots(matrix)
  const entry = result.entries[0]

  // weighted others = (2*0.5 + 4*0.5) / 1 = 3 ; gap = 4 - 3 = 1
  assert.equal(entry.weightedOthersScore, 3)
  assert.equal(entry.selfScore, 4)
  assert.equal(entry.selfGap, 1)
  // spread = 4 - 2 = 2
  assert.equal(entry.lensSpread, 2)
})

test('computeBlindSpots leaves the self gap null when there is no self score', () => {
  const matrix: PeriodScoreMatrix = {
    periodId: 'p1',
    periodName: 'Q1',
    scores: [employee('emp-1', { C_LEVEL: lens(2), PEER: lens(4) }, { C_LEVEL: 0.5, PEER: 0.5 })],
  }

  const result = computeBlindSpots(matrix)

  assert.equal(result.entries[0].selfScore, null)
  assert.equal(result.entries[0].selfGap, null)
  assert.equal(result.entries[0].lensSpread, 2)
})

test('computeBlindSpots excludes employees with fewer than two external lenses', () => {
  const matrix: PeriodScoreMatrix = {
    periodId: 'p1',
    periodName: 'Q1',
    scores: [
      employee('emp-1', { C_LEVEL: lens(2), SELF: lens(4) }, { C_LEVEL: 1 }),
      employee('emp-2', {}, {}),
    ],
  }

  const result = computeBlindSpots(matrix)

  assert.equal(result.entries.length, 0)
  assert.equal(result.insufficientData, true)
})

test('computeBlindSpots ranks flags by absolute self gap and by spread, capped at the limit', () => {
  const scores = Array.from({ length: 7 }, (_, index) =>
    employee(
      `emp-${index}`,
      { C_LEVEL: lens(1), PEER: lens(1 + index * 0.4), SELF: lens(4) },
      { C_LEVEL: 0.5, PEER: 0.5 }
    )
  )
  const result = computeBlindSpots({ periodId: 'p1', periodName: 'Q1', scores })

  assert.equal(result.topSelfGaps.length, BLIND_SPOT_FLAG_LIMIT)
  assert.equal(result.topSpreads.length, BLIND_SPOT_FLAG_LIMIT)
  // Widest spread is the last employee (PEER 1 + 6*0.4 = 3.4 vs C_LEVEL 1).
  assert.equal(result.topSpreads[0].employeeId, 'emp-6')
  // Largest |self gap| is the employee whose others score is lowest.
  assert.equal(result.topSelfGaps[0].employeeId, 'emp-0')
})

test('computeBlindSpots ranks a negative self gap by magnitude', () => {
  const matrix: PeriodScoreMatrix = {
    periodId: 'p1',
    periodName: 'Q1',
    scores: [
      employee(
        'emp-under',
        { C_LEVEL: lens(4), PEER: lens(4), SELF: lens(1) },
        { C_LEVEL: 0.5, PEER: 0.5 }
      ),
      employee(
        'emp-close',
        { C_LEVEL: lens(3), PEER: lens(3), SELF: lens(3) },
        { C_LEVEL: 0.5, PEER: 0.5 }
      ),
    ],
  }

  const result = computeBlindSpots(matrix)

  assert.equal(result.topSelfGaps[0].employeeId, 'emp-under')
  assert.equal(result.topSelfGaps[0].selfGap, -3)
})

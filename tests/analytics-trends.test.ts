import test from 'node:test'
import assert from 'node:assert/strict'
import { computeTrends, MOVERS_LIMIT } from '../lib/analytics/trends'
import type { EmployeePeriodScore, PeriodScoreMatrix } from '../lib/analytics/period-score-matrix'

function score(
  employeeId: string,
  department: string | null,
  overallScore: number
): EmployeePeriodScore {
  return { employeeId, department, overallScore, perLens: {}, weights: {} }
}

function matrix(
  periodId: string,
  periodName: string,
  scores: EmployeePeriodScore[]
): PeriodScoreMatrix {
  return { periodId, periodName, scores }
}

const q1 = matrix('p1', 'Q1', [score('emp-1', 'dept-a', 50), score('emp-2', 'dept-b', 80)])
const q2 = matrix('p2', 'Q2', [
  score('emp-1', 'dept-a', 70),
  score('emp-2', 'dept-b', 60),
  score('emp-3', 'dept-a', 90),
])

test('computeTrends builds org and department series in period order', () => {
  const result = computeTrends({ matrices: [q1, q2], currentPeriodId: 'p2', comparisonPeriodId: 'p1' })

  assert.deepEqual(
    result.orgSeries.map((point) => [point.periodName, point.avgScore, point.employeeCount]),
    [
      ['Q1', 65, 2],
      ['Q2', 220 / 3, 3],
    ]
  )

  const deptA = result.departmentSeries.find((series) => series.department === 'dept-a')
  assert.deepEqual(
    deptA?.points.map((point) => point.avgScore),
    [50, 80]
  )
})

test('computeTrends ranks improvers and decliners by delta', () => {
  const result = computeTrends({ matrices: [q1, q2], currentPeriodId: 'p2', comparisonPeriodId: 'p1' })

  assert.equal(result.topImprovers.length, 1)
  assert.equal(result.topImprovers[0].employeeId, 'emp-1')
  assert.equal(result.topImprovers[0].delta, 20)

  assert.equal(result.topDecliners.length, 1)
  assert.equal(result.topDecliners[0].employeeId, 'emp-2')
  assert.equal(result.topDecliners[0].delta, -20)
})

test('computeTrends separates new joiners from movers', () => {
  const result = computeTrends({ matrices: [q1, q2], currentPeriodId: 'p2', comparisonPeriodId: 'p1' })

  assert.deepEqual(
    result.newJoiners.map((joiner) => joiner.employeeId),
    ['emp-3']
  )
  const moverIds = [...result.topImprovers, ...result.topDecliners].map((mover) => mover.employeeId)
  assert.equal(moverIds.includes('emp-3'), false)
})

test('computeTrends caps each mover list at MOVERS_LIMIT', () => {
  const many = Array.from({ length: 8 }, (_, index) => score(`emp-${index}`, 'dept-a', 50))
  const improved = Array.from({ length: 8 }, (_, index) =>
    score(`emp-${index}`, 'dept-a', 50 + index + 1)
  )
  const result = computeTrends({
    matrices: [matrix('p1', 'Q1', many), matrix('p2', 'Q2', improved)],
    currentPeriodId: 'p2',
    comparisonPeriodId: 'p1',
  })

  assert.equal(result.topImprovers.length, MOVERS_LIMIT)
  assert.equal(result.topImprovers[0].delta, 8)
})

test('computeTrends flags insufficient data with only one period', () => {
  const result = computeTrends({ matrices: [q1], currentPeriodId: 'p1', comparisonPeriodId: null })

  assert.equal(result.insufficientData, true)
  assert.equal(result.topImprovers.length, 0)
  assert.equal(result.topDecliners.length, 0)
  assert.equal(result.orgSeries.length, 1)
})

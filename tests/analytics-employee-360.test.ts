import test from 'node:test'
import assert from 'node:assert/strict'
import type { RelationshipType } from '../types'
import {
  scoreToRadius,
  lensAngle,
  buildOrreryPoints,
  polygonPath,
  averagePolygonPath,
  deriveOutlook,
  compGrowth,
  MAX_LENS_SCORE,
  LOW_CONSENSUS_THRESHOLD,
  unionLensOrder,
  buildCompensationTrajectory,
  computeClientConcentration,
  deriveAvailability,
  getScorablePeriods,
  resolveEmploymentStatus,
  selectScorablePeriod,
  selfVsOthersGap,
  sortEvaluationLenses,
  sumApprovedWorkingLeaveDays,
  summarizeAvailability,
} from '../lib/analytics/employee-360'

const geometry = { innerRadius: 40, outerRadius: 140 }

test('a top score reaches the outer ring and a zero keeps a visible radius', () => {
  // Collapsing zero to the centre would make a low score look like a missing one.
  assert.equal(scoreToRadius(MAX_LENS_SCORE, 40, 140), 140)
  assert.equal(scoreToRadius(0, 40, 140), 40)
  assert.equal(scoreToRadius(2, 40, 140), 90)
})

test('scores outside the scale are clamped rather than escaping the ring', () => {
  assert.equal(scoreToRadius(9, 40, 140), 140)
  assert.equal(scoreToRadius(-3, 40, 140), 40)
  assert.equal(scoreToRadius(Number.NaN, 40, 140), 40)
})

test('the first lens sits at twelve o clock', () => {
  assert.equal(lensAngle(0, 5), -Math.PI / 2)
  // Evenly spaced around the full circle.
  assert.ok(Math.abs(lensAngle(1, 4) - 0) < 1e-9)
})

test('only lenses the person actually has are plotted, in canonical order', () => {
  // Fixed order matters: two people's shapes are meant to be compared directly.
  const points = buildOrreryPoints({
    perLens: { PEER: 3, TEAM_LEAD: 2 } as Partial<Record<RelationshipType, number>>,
    ...geometry,
  })

  assert.deepEqual(points.map((p) => p.lens), ['TEAM_LEAD', 'PEER'])
})

test('a higher score sits further from the centre', () => {
  const points = buildOrreryPoints({
    perLens: { TEAM_LEAD: 1, PEER: 4 } as Partial<Record<RelationshipType, number>>,
    ...geometry,
  })

  const radius = (p: { x: number; y: number }) => Math.hypot(p.x, p.y)
  assert.ok(radius(points[1]) > radius(points[0]))
})

test('the average ring is plotted on the same angles as the score', () => {
  const points = buildOrreryPoints({
    perLens: { TEAM_LEAD: 2 } as Partial<Record<RelationshipType, number>>,
    orgAverage: { TEAM_LEAD: 3 } as Partial<Record<RelationshipType, number>>,
    ...geometry,
  })

  const point = points[0]
  assert.equal(point.average, 3)
  // Same bearing, larger radius, so the gap reads as under- or over-performance.
  assert.ok(Math.hypot(point.averageX!, point.averageY!) > Math.hypot(point.x, point.y))
})

test('the reference shape is withheld unless every lens has an average', () => {
  // A partial outline would imply a comparison that is not being made.
  const partial = buildOrreryPoints({
    perLens: { TEAM_LEAD: 2, PEER: 3 } as Partial<Record<RelationshipType, number>>,
    orgAverage: { TEAM_LEAD: 3 } as Partial<Record<RelationshipType, number>>,
    ...geometry,
  })

  assert.equal(averagePolygonPath(partial), '')

  const complete = buildOrreryPoints({
    perLens: { TEAM_LEAD: 2, PEER: 3 } as Partial<Record<RelationshipType, number>>,
    orgAverage: { TEAM_LEAD: 3, PEER: 3 } as Partial<Record<RelationshipType, number>>,
    ...geometry,
  })

  assert.ok(averagePolygonPath(complete).startsWith('M'))
})

test('a polygon needs at least two points to be drawn', () => {
  assert.equal(polygonPath([]), '')
  assert.equal(polygonPath([{ x: 1, y: 1 }]), '')
  assert.ok(polygonPath([{ x: 0, y: 0 }, { x: 1, y: 1 }]).endsWith('Z'))
})

test('outlook reuses the talent grid label so the two views cannot disagree', () => {
  const outlook = deriveOutlook({
    cellLabel: 'Top performer',
    momentumDelta: 4.2,
    consensus: 0.9,
    isNew: false,
  })

  assert.equal(outlook.headline, 'Top performer')
  assert.equal(outlook.tone, 'STRONG')
  assert.match(outlook.detail, /up 4\.2 points/)
  assert.equal(outlook.caveat, null)
})

test('a struggling label reads as one to watch', () => {
  for (const label of ['At-risk', 'Needs support', 'Slipping star', 'Drifting']) {
    const outlook = deriveOutlook({ cellLabel: label, momentumDelta: -2, consensus: 0.8, isNew: false })
    assert.equal(outlook.tone, 'WATCH', `${label} should read as WATCH`)
  }
})

test('split opinions qualify the verdict without reversing it', () => {
  const outlook = deriveOutlook({
    cellLabel: 'Top performer',
    momentumDelta: 1,
    consensus: LOW_CONSENSUS_THRESHOLD - 0.1,
    isNew: false,
  })

  // Disagreement makes a read less certain, not the opposite read.
  assert.equal(outlook.headline, 'Top performer')
  assert.equal(outlook.tone, 'STRONG')
  assert.ok(outlook.caveat && /disagree/i.test(outlook.caveat))
})

test('a new joiner gets no invented direction', () => {
  const outlook = deriveOutlook({ cellLabel: null, momentumDelta: null, consensus: null, isNew: true })

  assert.equal(outlook.tone, 'UNKNOWN')
  assert.equal(outlook.caveat, null)
  assert.match(outlook.headline, /too early/i)
})

test('a missing previous period is stated rather than shown as flat', () => {
  const outlook = deriveOutlook({ cellLabel: 'Core', momentumDelta: null, consensus: 0.7, isNew: false })

  assert.match(outlook.detail, /no comparable previous period/)
})

test('comp growth needs a trajectory, not a single figure', () => {
  assert.equal(compGrowth([]), null)
  assert.equal(compGrowth([{ effectiveFrom: '2026-01-01', total: 100 }]), null)

  const growth = compGrowth([
    { effectiveFrom: '2026-01-01', total: 100 },
    { effectiveFrom: '2026-06-01', total: 125 },
  ])
  assert.equal(growth, 25)
})

test('two people compared share one set of axes', () => {
  // Without a shared axis list each outline would sit at different bearings and
  // the overlay would compare nothing.
  const a = { TEAM_LEAD: 3, PEER: 2 } as Partial<Record<RelationshipType, number>>
  const b = { PEER: 4, HR: 3 } as Partial<Record<RelationshipType, number>>
  const axes = unionLensOrder(a, b)

  assert.deepEqual(axes, ['TEAM_LEAD', 'PEER', 'HR'])

  const pa = buildOrreryPoints({ perLens: a, lensOrder: axes, ...geometry })
  const pb = buildOrreryPoints({ perLens: b, lensOrder: axes, ...geometry })

  // Only the readings each person has are plotted...
  assert.deepEqual(pa.map((p) => p.lens), ['TEAM_LEAD', 'PEER'])
  assert.deepEqual(pb.map((p) => p.lens), ['PEER', 'HR'])

  // ...but the lens they share sits at exactly the same bearing on both.
  const peerA = pa.find((p) => p.lens === 'PEER')!
  const peerB = pb.find((p) => p.lens === 'PEER')!
  assert.equal(peerA.angle, peerB.angle)
})

test('a person missing an axis simply has no point there', () => {
  const axes = unionLensOrder({ TEAM_LEAD: 3, PEER: 2, HR: 4 })
  const points = buildOrreryPoints({ perLens: { PEER: 2 }, lensOrder: axes, ...geometry })

  assert.equal(points.length, 1)
  assert.equal(points[0].lens, 'PEER')
})

test('SELF is a canonical, separately ordered lens', () => {
  const axes = unionLensOrder({ SELF: 4, PEER: 3, TEAM_LEAD: 2 })
  assert.deepEqual(axes, ['TEAM_LEAD', 'PEER', 'SELF'])

  const sorted = sortEvaluationLenses([
    {
      relationshipType: 'SELF' as const,
      score: 4,
      evaluatorCount: 1,
      orgAverage: null,
      weight: 0,
      includedInOverall: false,
    },
    {
      relationshipType: 'TEAM_LEAD' as const,
      score: 2,
      evaluatorCount: 1,
      orgAverage: 3,
      weight: 1,
      includedInOverall: true,
    },
  ])
  assert.deepEqual(sorted.map((lens) => lens.relationshipType), ['TEAM_LEAD', 'SELF'])
  assert.equal(sorted[1].includedInOverall, false)
})

test('period selection excludes an empty newest period', () => {
  const periods = [
    {
      id: 'empty',
      name: 'Q3',
      startDate: '2026-07-01T00:00:00.000Z',
      endDate: '2026-09-30T00:00:00.000Z',
      isActive: true,
      submittedScoreCount: 0,
    },
    {
      id: 'newest-scorable',
      name: 'Q2',
      startDate: '2026-04-01T00:00:00.000Z',
      endDate: '2026-06-30T00:00:00.000Z',
      isActive: false,
      submittedScoreCount: 12,
    },
    {
      id: 'older',
      name: 'Q1',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-03-31T00:00:00.000Z',
      isActive: false,
      submittedScoreCount: 9,
    },
  ]

  assert.deepEqual(getScorablePeriods(periods).map((period) => period.id), [
    'newest-scorable',
    'older',
  ])
  assert.equal(selectScorablePeriod(periods)?.id, 'newest-scorable')
})

test('period selection prefers an active scorable period and honors a valid request', () => {
  const periods = [
    {
      id: 'newer',
      name: 'Q2',
      startDate: '2026-04-01T00:00:00.000Z',
      endDate: '2026-06-30T00:00:00.000Z',
      isActive: false,
      submittedScoreCount: 12,
    },
    {
      id: 'active',
      name: 'Q1',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-03-31T00:00:00.000Z',
      isActive: true,
      submittedScoreCount: 9,
    },
  ]

  assert.equal(selectScorablePeriod(periods)?.id, 'active')
  assert.equal(selectScorablePeriod(periods, 'newer')?.id, 'newer')
  assert.equal(selectScorablePeriod(periods, 'not-scorable')?.id, 'active')
})

test('availability distinguishes complete, partial, and absent evidence', () => {
  assert.equal(deriveAvailability([true, true]), 'AVAILABLE')
  assert.equal(deriveAvailability([true, false]), 'PARTIAL')
  assert.equal(deriveAvailability([false, false]), 'NO_DATA')
  assert.equal(deriveAvailability([]), 'NO_DATA')

  const summary = summarizeAvailability({
    evaluation: 'AVAILABLE',
    clients: 'PARTIAL',
    compensation: 'NO_DATA',
    operations: 'AVAILABLE',
    network: 'NO_DATA',
  })
  assert.equal(summary.status, 'PARTIAL')
  assert.equal(summary.availableDomains, 2)
  assert.equal(summary.partialDomains, 1)
  assert.equal(summary.noDataDomains, 2)
  assert.equal(summary.completeness, 0.5)
})

test('employees without a payroll profile remain active', () => {
  assert.equal(resolveEmploymentStatus(undefined), 'ACTIVE')
  assert.equal(resolveEmploymentStatus(null), 'ACTIVE')
  assert.equal(resolveEmploymentStatus(true), 'ACTIVE')
  assert.equal(resolveEmploymentStatus(false), 'ARCHIVED')
})

test('salary observations collapse unchanged months into verified change events', () => {
  const trajectory = buildCompensationTrajectory([
    {
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      amount: 100_000,
      currency: 'pkr',
      periodId: 'jan',
      periodName: 'January',
      periodStatus: 'APPROVED',
      receiptStatus: 'COMPLETED',
    },
    {
      effectiveFrom: '2026-02-01T00:00:00.000Z',
      amount: 100_000,
      currency: 'PKR',
      periodId: 'feb',
      periodName: 'February',
      periodStatus: 'SENT',
      receiptStatus: 'SENT',
    },
    {
      effectiveFrom: '2026-03-01T00:00:00.000Z',
      amount: 120_000,
      currency: 'PKR',
      periodId: 'mar',
      periodName: 'March',
      periodStatus: 'LOCKED',
      receiptStatus: 'COMPLETED',
    },
    {
      effectiveFrom: '2026-04-01T00:00:00.000Z',
      amount: 999_999,
      currency: 'PKR',
      periodStatus: 'FAILED',
      receiptStatus: 'FAILED',
    },
  ])

  assert.equal(trajectory.currency, 'PKR')
  assert.equal(trajectory.currentBasic, 120_000)
  assert.deepEqual(trajectory.history.map((point) => point.amount), [100_000, 120_000])
  assert.equal(trajectory.changeEvents.length, 1)
  assert.equal(trajectory.changeEvents[0].delta, 20_000)
  assert.equal(trajectory.changeEvents[0].percentChange, 20)
  assert.equal(trajectory.growth, 20)
})

test('mixed-currency salary streams are retained but never combined', () => {
  const trajectory = buildCompensationTrajectory([
    {
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      amount: 100_000,
      currency: 'PKR',
      periodStatus: 'APPROVED',
      receiptStatus: 'COMPLETED',
    },
    {
      effectiveFrom: '2026-02-01T00:00:00.000Z',
      amount: 1_000,
      currency: 'USD',
      periodStatus: 'APPROVED',
      receiptStatus: 'COMPLETED',
    },
    {
      effectiveFrom: '2026-03-01T00:00:00.000Z',
      amount: 110_000,
      currency: 'PKR',
      periodStatus: 'LOCKED',
      receiptStatus: 'SENT',
    },
  ])

  assert.deepEqual(trajectory.currencies, ['PKR', 'USD'])
  assert.equal(trajectory.currency, null)
  assert.equal(trajectory.currentBasic, null)
  assert.equal(trajectory.growth, null)
  assert.deepEqual(
    trajectory.history.map((point) => `${point.currency}:${point.amount}`),
    ['PKR:100000', 'USD:1000', 'PKR:110000']
  )
  assert.equal(trajectory.changeEvents.length, 1)
  assert.equal(trajectory.changeEvents[0].currency, 'PKR')
})

test('salary observations without verified statuses are ignored', () => {
  const trajectory = buildCompensationTrajectory([
    {
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      amount: 100_000,
      currency: 'PKR',
      periodStatus: null,
      receiptStatus: null,
    },
  ])

  assert.equal(trajectory.currentBasic, null)
  assert.deepEqual(trajectory.history, [])
})

test('client concentration describes recorded assignment share without inventing a primary', () => {
  const result = computeClientConcentration([
    { clientId: 'a', clientName: 'Alpha' },
    { clientId: 'b', clientName: 'Beta' },
    { clientId: 'c', clientName: 'Gamma' },
  ])

  assert.deepEqual(result, {
    primaryClientId: null,
    primaryClientName: null,
    share: 1 / 3,
    basis: 'ASSIGNMENT_COUNT',
  })
  assert.equal(computeClientConcentration([]), null)
})

test('approved leave uses weekday and half-day semantics', () => {
  const total = sumApprovedWorkingLeaveDays([
    {
      status: 'APPROVED',
      startDate: '2026-02-06T00:00:00.000Z',
      endDate: '2026-02-09T00:00:00.000Z',
      isHalfDay: false,
    },
    {
      status: 'APPROVED',
      startDate: '2026-02-10T00:00:00.000Z',
      endDate: '2026-02-10T00:00:00.000Z',
      isHalfDay: true,
    },
    {
      status: 'PENDING',
      startDate: '2026-02-11T00:00:00.000Z',
      endDate: '2026-02-13T00:00:00.000Z',
      isHalfDay: false,
    },
  ])

  assert.equal(total, 2.5)
})

test('self-versus-others gap uses the weighted overall without changing it', () => {
  assert.equal(selfVsOthersGap(4, 75), 1)
  assert.equal(selfVsOthersGap(null, 75), null)
  assert.equal(selfVsOthersGap(4, null), null)
})

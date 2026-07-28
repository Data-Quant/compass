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

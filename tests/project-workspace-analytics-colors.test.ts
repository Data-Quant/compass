import assert from 'node:assert/strict'
import test from 'node:test'
import { CATEGORICAL, NEUTRAL } from '../components/projects/analytics/chart-theme'
import { assignProjectColors, colorsAreDistinct, OTHER_KEY } from '../components/projects/analytics/workspace-colors'

const project = (name: string, color: string | null, completed = 0) => ({ projectId: name.toLowerCase(), name, color, completed })

test('keeps project colours when all are set and distinct', () => {
  const result = assignProjectColors([project('Beta', '#0d9488'), project('Alpha', '#d97706')])
  assert.deepEqual(result.series.map((s) => [s.label, s.color]), [['Alpha', '#d97706'], ['Beta', '#0d9488']])
  assert.equal(result.colorOf('beta'), '#0d9488')
})

test('falls back to the palette in name order when a colour is missing or two are too close', () => {
  const missing = assignProjectColors([project('Beta', '#0d9488'), project('Alpha', null)])
  assert.deepEqual(missing.series.map((s) => s.color), [CATEGORICAL[0], CATEGORICAL[1]])
  const close = assignProjectColors([project('Alpha', '#6366f1'), project('Beta', '#6466f0')])
  assert.deepEqual(close.series.map((s) => s.color), [CATEGORICAL[0], CATEGORICAL[1]])
  assert.equal(colorsAreDistinct(['#6366f1', 'red']), false)
})

test('folds projects beyond six into Other, keeping the busiest', () => {
  const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((name, i) => project(name, null, name === 'A' ? 0 : i))
  const result = assignProjectColors(many)
  assert.equal(result.series.length, 7)
  assert.equal(result.series.at(-1)?.key, OTHER_KEY)
  assert.equal(result.keyOf('a'), OTHER_KEY)
  assert.equal(result.colorOf('a'), NEUTRAL)
  assert.equal(result.keyOf('g'), 'g')
})

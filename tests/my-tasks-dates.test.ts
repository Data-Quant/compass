import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays, dateDiffInDays, isBetweenExclusiveInclusive, isSameOrBefore, toStartOfDay } from '../lib/my-tasks/dates'

test('toStartOfDay normalizes time', () => {
  const date = toStartOfDay(new Date('2026-02-18T21:14:00.000Z'))
  assert.equal(date.getUTCHours(), 0)
  assert.equal(date.getUTCMinutes(), 0)
})

test('addDays shifts by exact day count', () => {
  const result = addDays(new Date('2026-02-18T00:00:00.000Z'), 7)
  assert.equal(result.toISOString().slice(0, 10), '2026-02-25')
})

test('dateDiffInDays returns positive duration', () => {
  const diff = dateDiffInDays('2026-02-18T00:00:00.000Z', '2026-02-21T00:00:00.000Z')
  assert.equal(diff, 3)
})

test('range helpers compare calendar days', () => {
  assert.equal(isSameOrBefore('2026-02-18T18:00:00.000Z', '2026-02-18T01:00:00.000Z'), true)
  assert.equal(
    isBetweenExclusiveInclusive('2026-02-19T00:00:00.000Z', '2026-02-18T00:00:00.000Z', '2026-02-20T00:00:00.000Z'),
    true
  )
})

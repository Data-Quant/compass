import test from 'node:test'
import assert from 'node:assert/strict'
import { formTableRowSchema } from '../lib/weekly/schemas'
import { formatScore, isTableScore, TABLE_SCORES } from '../lib/weekly/table-scores'

test('the quarter-end tables offer 1 to 4 in quarter steps', () => {
  assert.equal(TABLE_SCORES.length, 13)
  assert.deepEqual([TABLE_SCORES[0], TABLE_SCORES[6], TABLE_SCORES[12]], [1, 2.5, 4])
  for (const ok of [1, 2.5, 2.75, 3, 3.25, 3.5, 4]) assert.equal(isTableScore(ok), true, String(ok))
  for (const bad of [0, 0.75, 2.6, 3.1, 4.25, Number.NaN]) assert.equal(isTableScore(bad), false, String(bad))
})

test('scores and totals read as people write them', () => {
  assert.deepEqual([formatScore(3), formatScore(2.5), formatScore(3.25), formatScore(6.25)], ['3', '2.5', '3.25', '6.25'])
})

test('a table row accepts quarter steps and blanks, and refuses other numbers', () => {
  const row = (ratingValue: number | null) => ({ kind: 'HR', evaluatorId: 'hr', relationshipType: 'HR', evaluateeId: 'ana', submit: false, ratings: [{ questionId: 'q1', ratingValue }] })
  assert.equal(formTableRowSchema.safeParse(row(2.75)).success, true)
  assert.equal(formTableRowSchema.safeParse(row(null)).success, true)
  assert.equal(formTableRowSchema.safeParse(row(2.6)).success, false)
  assert.equal(formTableRowSchema.safeParse(row(5)).success, false)
})

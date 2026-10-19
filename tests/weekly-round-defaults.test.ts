import test from 'node:test'
import assert from 'node:assert/strict'
import { nextRoundDefaults } from '../lib/weekly/round-defaults'

test('a new round is prefilled with the next quarter, its first Monday and the question weeks that fit', () => {
  assert.deepEqual(nextRoundDefaults(new Date('2026-10-09T06:00:00.000Z')), {
    name: 'Q1 2027', startDate: '2027-01-01', endDate: '2027-03-31', weekOneStartsOn: '2027-01-04', questionWeeks: 11,
  })
  // Q3 starts on Wednesday 1 July 2026: week 1 is the following Monday.
  assert.deepEqual(nextRoundDefaults(new Date('2026-04-20T06:00:00.000Z')), {
    name: 'Q3 2026', startDate: '2026-07-01', endDate: '2026-09-30', weekOneStartsOn: '2026-07-06', questionWeeks: 11,
  })
})

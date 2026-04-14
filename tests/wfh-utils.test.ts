import test from 'node:test'
import assert from 'node:assert/strict'

import {
  calculateWfhDays,
  canRequestWfh,
  hasWfhEnded,
  isValidWfhDateRange,
  wfhRequiresLeadApproval,
} from '../lib/wfh-utils'

test('canRequestWfh only allows 3E departments', () => {
  assert.equal(canRequestWfh('3E'), true)
  assert.equal(canRequestWfh(' 3e '), true)
  assert.equal(canRequestWfh('Technology'), false)
  assert.equal(canRequestWfh(null), false)
})

test('calculateWfhDays counts working weekdays only', () => {
  const start = new Date('2026-04-10T00:00:00.000Z') // Friday
  const end = new Date('2026-04-13T00:00:00.000Z') // Monday
  assert.equal(calculateWfhDays(start, end), 2)
})

test('isValidWfhDateRange rejects inverted ranges', () => {
  assert.equal(
    isValidWfhDateRange(new Date('2026-04-14T00:00:00.000Z'), new Date('2026-04-13T00:00:00.000Z')),
    false
  )
})

test('wfhRequiresLeadApproval follows upstream lead presence', () => {
  assert.equal(wfhRequiresLeadApproval(1), true)
  assert.equal(wfhRequiresLeadApproval(0), false)
})

test('hasWfhEnded compares by calendar day', () => {
  const now = new Date('2026-04-14T12:00:00.000Z')
  assert.equal(hasWfhEnded(new Date('2026-04-13T00:00:00.000Z'), now), true)
  assert.equal(hasWfhEnded(new Date('2026-04-14T00:00:00.000Z'), now), false)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { kpiDeadline, parseDueDate } from '../lib/kpi/deadline'
import { createKpiSchema, updateKpiSchema } from '../lib/kpi/schemas'

const october = { year: 2026, month: 10 }
// 23:59:59.999 Karachi on a day = 18:59:59.999 UTC.
const endOf = (day: string) => new Date(`${day}T18:59:59.999Z`)

test('a KPI without its own deadline is due at the end of its month', () => {
  assert.deepEqual(kpiDeadline({ dueDate: null, claimedAt: null, status: 'LOCKED' }, october), { dueDate: '2026-10-31', completedAt: null, late: false })
})

test('the completed date is the done claim, and it is late only after the deadline day', () => {
  const due = endOf('2026-10-15')
  assert.deepEqual(kpiDeadline({ dueDate: due, claimedAt: new Date('2026-10-15T18:00:00Z'), status: 'CLAIMED_DONE' }, october), { dueDate: '2026-10-15', completedAt: '2026-10-15', late: false })
  assert.deepEqual(kpiDeadline({ dueDate: due, claimedAt: new Date('2026-10-15T19:30:00Z'), status: 'VERIFIED' }, october), { dueDate: '2026-10-15', completedAt: '2026-10-16', late: true })
})

test('a not-done or cancelled KPI has no completed date', () => {
  for (const status of ['NOT_DONE', 'CANCELLED', 'DRAFT', 'LOCKED'] as const) {
    assert.equal(kpiDeadline({ dueDate: null, claimedAt: new Date('2026-10-20T08:00:00Z'), status }, october).completedAt, null)
  }
})

test('a deadline must be a real day inside the month of the KPI', () => {
  assert.deepEqual(parseDueDate('2026-10-15', october), endOf('2026-10-15'))
  assert.equal(parseDueDate(undefined, october).getTime(), endOf('2026-10-31').getTime())
  assert.throws(() => parseDueDate('2026-11-01', october), /October 2026/)
  assert.throws(() => parseDueDate('2026-10-32', october), /date/)
})

test('the KPI forms accept a YYYY-MM-DD deadline and nothing else', () => {
  const base = { goalId: 'g', title: 'Outreach', target: '40 emails', evidenceType: 'LINK', ownerIds: ['a'] }
  assert.equal(createKpiSchema.safeParse({ ...base, dueDate: '2026-10-15' }).success, true)
  assert.equal(updateKpiSchema.safeParse({ action: 'edit', version: 0, dueDate: '2026-10-15' }).success, true)
  assert.equal(createKpiSchema.safeParse({ ...base, dueDate: '15/10/2026' }).success, false)
})

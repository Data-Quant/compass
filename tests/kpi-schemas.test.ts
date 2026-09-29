import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createGoalSchema, createKpiSchema, deadlineDatesSchema, setterAssignmentSchema, toDeadlines, updateGoalSchema, updateKpiSchema,
} from '../lib/kpi/schemas'

test('department goals need a department; team goals must not have one', () => {
  assert.equal(createGoalSchema.safeParse({ monthKey: '2026-10', scope: 'DEPARTMENT', title: 'Ship Q4' }).success, false)
  assert.equal(createGoalSchema.safeParse({ monthKey: '2026-10', scope: 'DEPARTMENT', departmentKey: 'product', title: 'Ship Q4' }).success, true)
  assert.equal(createGoalSchema.safeParse({ monthKey: '2026-10', scope: 'TEAM', departmentKey: 'product', title: 'Grow' }).success, false)
  assert.equal(createGoalSchema.safeParse({ monthKey: '2026-10', scope: 'DEPARTMENT', departmentKey: 'product', setterId: 'x', title: 'Ship' }).success, false)
  assert.equal(createGoalSchema.safeParse({ monthKey: '2026-13', scope: 'TEAM', title: 'Grow' }).success, false)
  assert.equal(createGoalSchema.safeParse({ monthKey: '2026-10', scope: 'TEAM', title: 'Gr' }).success, false)
})

test('KPIs need a measurable target, a proof type and owners', () => {
  const kpi = { goalId: 'g', title: 'Outreach', target: '40 emails', evidenceType: 'NUMBER', ownerIds: ['a'] }
  assert.equal(createKpiSchema.safeParse(kpi).success, true)
  assert.equal(createKpiSchema.safeParse({ ...kpi, target: '  ' }).success, false)
  assert.equal(createKpiSchema.safeParse({ ...kpi, ownerIds: [] }).success, false)
  assert.equal(createKpiSchema.safeParse({ ...kpi, evidenceType: 'VIBES' }).success, false)
  assert.equal(createKpiSchema.safeParse({ ...kpi, extra: true }).success, false)
})

test('updates are discriminated by action', () => {
  assert.equal(updateKpiSchema.safeParse({ action: 'discard', version: 0 }).success, true)
  assert.equal(updateKpiSchema.safeParse({ action: 'edit', version: 1, title: 'New title' }).success, true)
  assert.equal(updateKpiSchema.safeParse({ action: 'edit', title: 'No version' }).success, false)
  assert.equal(updateGoalSchema.safeParse({ action: 'archive' }).success, true)
  assert.equal(updateGoalSchema.safeParse({ action: 'edit', description: null }).success, true)
})

test('deadline dates must be real dates and convert to the end of the Karachi day', () => {
  const dates = { goalsLockAt: '2026-10-14', claimsDueAt: '2026-11-04', verifyDueAt: '2026-11-11', responseDueAt: '2026-11-13', targetFinalAt: '2026-11-17' }
  assert.equal(deadlineDatesSchema.safeParse({ ...dates, goalsLockAt: '2026-02-30' }).success, false)
  assert.equal(toDeadlines(deadlineDatesSchema.parse(dates)).goalsLockAt.toISOString(), '2026-10-14T18:59:59.999Z')
})

test('setter assignments need a reason', () => {
  assert.equal(setterAssignmentSchema.safeParse({ employeeId: 'a', setterId: 'b', reason: '' }).success, false)
  assert.equal(setterAssignmentSchema.safeParse({ employeeId: 'a', setterId: 'b', reason: 'No lead mapping' }).success, true)
})

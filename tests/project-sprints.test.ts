import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getSprintStatus,
  parseSprintDate,
  pickDefaultSprint,
  sprintNeedsReview,
  validateSprintCompletionPlan,
  validateSprintInput,
} from '../lib/project-sprints'

const T1 = 'task00000000000000000001'
const T2 = 'task00000000000000000002'
const S_THIS = 'sprint000000000000000001'
const S_NEXT = 'sprint000000000000000002'
const S_DONE = 'sprint000000000000000003'

test('parseSprintDate accepts real YYYY-MM-DD days only', () => {
  assert.equal(parseSprintDate('2026-10-19')?.toISOString(), '2026-10-19T00:00:00.000Z')
  assert.equal(parseSprintDate('2026-02-30'), null)
  assert.equal(parseSprintDate('2026-1-01'), null)
  assert.equal(parseSprintDate('2026-10-19T00:00'), null)
  assert.equal(parseSprintDate(20261019), null)
})

test('validateSprintInput trims names and computes preset ends', () => {
  const result = validateSprintInput({ name: '  Sprint 5 ', startDate: '2026-10-19', length: 14 })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.name, 'Sprint 5')
  assert.equal(result.value.endDate.toISOString().slice(0, 10), '2026-11-01')
})

test('validateSprintInput accepts custom dates and enforces the rules', () => {
  assert.equal(validateSprintInput({ name: 'A', startDate: '2026-10-19', endDate: '2026-10-19', length: 'custom' }).ok, true)
  assert.equal(validateSprintInput({ name: 'A', startDate: '2026-10-19', endDate: '2026-12-13' }).ok, true) // 56 days
  assert.equal(validateSprintInput({ name: 'A', startDate: '2026-10-19', endDate: '2026-12-14' }).ok, false) // 57 days
  assert.equal(validateSprintInput({ name: 'A', startDate: '2026-10-19', endDate: '2026-10-18' }).ok, false)
  assert.equal(validateSprintInput({ name: '   ', startDate: '2026-10-19', length: 7 }).ok, false)
  assert.equal(validateSprintInput({ name: 'x'.repeat(81), startDate: '2026-10-19', length: 7 }).ok, false)
  assert.equal(validateSprintInput({ name: 'x'.repeat(80), startDate: '2026-10-19', length: 7 }).ok, true)
  assert.equal(validateSprintInput({ name: 'A', startDate: '2026-10-19', length: 10 }).ok, false)
  assert.equal(validateSprintInput({ name: 'A', startDate: '2026-10-19' }).ok, false)
  assert.equal(validateSprintInput(null).ok, false)
})

test('getSprintStatus uses Asia/Karachi days', () => {
  const sprint = { startDate: '2026-10-19T00:00:00.000Z', endDate: '2026-11-01T00:00:00.000Z' }
  // 2026-10-18 20:00 UTC is already Oct 19 in Karachi (UTC+5).
  assert.equal(getSprintStatus(sprint, new Date('2026-10-18T18:00:00Z')), 'upcoming')
  assert.equal(getSprintStatus(sprint, new Date('2026-10-18T20:00:00Z')), 'current')
  assert.equal(getSprintStatus(sprint, new Date('2026-11-01T18:00:00Z')), 'current')
  assert.equal(getSprintStatus(sprint, new Date('2026-11-01T19:30:00Z')), 'past')
  assert.equal(getSprintStatus({ ...sprint, completedAt: new Date() }, new Date('2026-10-20T00:00:00Z')), 'completed')
})

test('sprintNeedsReview only for ended, uncompleted sprints', () => {
  const sprint = { startDate: '2026-10-05', endDate: '2026-10-18' }
  const now = new Date('2026-10-23T08:00:00Z')
  assert.equal(sprintNeedsReview(sprint, now), true)
  assert.equal(sprintNeedsReview({ ...sprint, completedAt: '2026-10-19' }, now), false)
  assert.equal(sprintNeedsReview({ startDate: '2026-10-19', endDate: '2026-11-01' }, now), false)
})

test('pickDefaultSprint returns the current sprint or null', () => {
  const now = new Date('2026-10-23T08:00:00Z')
  const past = { id: 'a', startDate: '2026-10-05', endDate: '2026-10-18' }
  const current = { id: 'b', startDate: '2026-10-19', endDate: '2026-11-01' }
  const upcoming = { id: 'c', startDate: '2026-11-02', endDate: '2026-11-15' }
  assert.equal(pickDefaultSprint([upcoming, current, past], now)?.id, 'b')
  assert.equal(pickDefaultSprint([upcoming, past], now), null)
  assert.equal(pickDefaultSprint([{ ...current, completedAt: '2026-10-22' }], now), null)
})

test('validateSprintCompletionPlan requires one valid action per unfinished task', () => {
  const base = {
    sprintId: S_THIS,
    unfinishedTaskIds: [T1, T2],
    projectSprints: [
      { id: S_THIS, completedAt: null },
      { id: S_NEXT, completedAt: null },
      { id: S_DONE, completedAt: '2026-10-01' },
    ],
  }
  const ok = validateSprintCompletionPlan({
    ...base,
    actions: [{ taskId: T1, action: 'move', targetSprintId: S_NEXT }, { taskId: T2, action: 'none' }],
  })
  assert.deepEqual(ok, {
    ok: true,
    value: [{ taskId: T1, action: 'move', targetSprintId: S_NEXT }, { taskId: T2, action: 'none' }],
  })

  const fail = (actions: unknown) => assert.equal(validateSprintCompletionPlan({ ...base, actions }).ok, false)
  fail([{ taskId: T1, action: 'keep' }]) // missing T2
  fail([{ taskId: T1, action: 'keep' }, { taskId: T1, action: 'none' }]) // duplicate
  fail([{ taskId: T1, action: 'keep' }, { taskId: T2, action: 'delete' }]) // bad enum
  fail([{ taskId: T1, action: 'move', targetSprintId: S_THIS }, { taskId: T2, action: 'keep' }]) // same sprint
  fail([{ taskId: T1, action: 'move', targetSprintId: S_DONE }, { taskId: T2, action: 'keep' }]) // completed target
  fail([{ taskId: T1, action: 'move', targetSprintId: 'sprint000000000000000099' }, { taskId: T2, action: 'keep' }])
  fail([{ taskId: T1, action: 'keep' }, { taskId: T2, action: 'keep' }, { taskId: 'task00000000000000000003', action: 'keep' }])
  fail('nope')
  fail(Array.from({ length: 501 }, () => ({ taskId: T1, action: 'keep' })))
  assert.equal(validateSprintCompletionPlan({ ...base, unfinishedTaskIds: [], actions: [] }).ok, true)
})

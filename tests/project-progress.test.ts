import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateProjectProgress,
  calculateTaskVariance,
  shouldMarkTaskCompletedLate,
} from '../lib/project-progress'

test('project progress excludes backlog tasks', () => {
  const progress = calculateProjectProgress([
    { status: 'DONE', assigneeId: 'u1', section: { isBacklog: false } },
    { status: 'TODO', assigneeId: 'u1', section: { isBacklog: false } },
    { status: 'TODO', assigneeId: 'u1', section: { isBacklog: true } },
  ])

  assert.deepEqual(progress, { completed: 1, total: 2, percentage: 50 })
})

test('project progress can be scoped to one assignee', () => {
  const tasks = [
    { status: 'DONE', assigneeId: 'u1', section: { isBacklog: false } },
    { status: 'TODO', assigneeId: 'u1', section: { isBacklog: false } },
    { status: 'DONE', assigneeId: 'u2', section: { isBacklog: false } },
  ]

  assert.deepEqual(calculateProjectProgress(tasks, { assigneeId: 'u1' }), {
    completed: 1,
    total: 2,
    percentage: 50,
  })
  assert.deepEqual(calculateProjectProgress(tasks, { assigneeId: 'u2' }), {
    completed: 1,
    total: 1,
    percentage: 100,
  })
})

test('project progress uses null percentage when no active tasks exist', () => {
  assert.deepEqual(
    calculateProjectProgress([{ status: 'TODO', section: { isBacklog: true } }]),
    { completed: 0, total: 0, percentage: null }
  )
})

test('variance compares calendar dates and excludes backlog and completed tasks', () => {
  const now = new Date('2026-07-31T18:00:00.000Z')

  assert.deepEqual(
    calculateTaskVariance({ status: 'TODO', dueDate: '2026-07-27T00:00:00.000Z', section: { isBacklog: false } }, now),
    { isOverdue: true, daysLate: 4 }
  )
  assert.equal(
    calculateTaskVariance({ status: 'TODO', dueDate: '2026-07-31T00:00:00.000Z', section: { isBacklog: false } }, now).isOverdue,
    false
  )
  assert.equal(
    calculateTaskVariance({ status: 'TODO', dueDate: '2026-07-27T00:00:00.000Z', section: { isBacklog: true } }, now).isOverdue,
    false
  )
  assert.equal(
    calculateTaskVariance({ status: 'DONE', dueDate: '2026-07-27T00:00:00.000Z', section: { isBacklog: false } }, now).isOverdue,
    false
  )
})

test('variance uses the Asia/Karachi business date around UTC midnight', () => {
  const karachiJustAfterMidnight = new Date('2026-07-30T19:30:00.000Z')

  assert.deepEqual(calculateTaskVariance({
    status: 'TODO',
    dueDate: '2026-07-31T00:00:00.000Z',
  }, karachiJustAfterMidnight), { isOverdue: false, daysLate: 0 })
  assert.deepEqual(calculateTaskVariance({
    status: 'TODO',
    dueDate: '2026-07-30T00:00:00.000Z',
  }, karachiJustAfterMidnight), { isOverdue: true, daysLate: 1 })
})

test('completed late is set only on the first overdue completion and is permanent', () => {
  const now = new Date('2026-07-31T18:00:00.000Z')
  assert.equal(shouldMarkTaskCompletedLate({
    previousStatus: 'IN_PROGRESS',
    nextStatus: 'DONE',
    dueDate: '2026-07-30T00:00:00.000Z',
    section: { isBacklog: false },
    now,
  }), true)
  assert.equal(shouldMarkTaskCompletedLate({
    wasCompletedLate: true,
    previousStatus: 'DONE',
    nextStatus: 'TODO',
    dueDate: '2026-07-30T00:00:00.000Z',
    section: { isBacklog: false },
    now,
  }), true)
})

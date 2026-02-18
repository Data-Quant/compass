import test from 'node:test'
import assert from 'node:assert/strict'
import { getSmartBucket, groupTasksByBucket } from '../lib/my-tasks/buckets'
import type { MyTaskRecord } from '../lib/my-tasks/types'

function buildTask(overrides: Partial<MyTaskRecord>): MyTaskRecord {
  return {
    id: 't1',
    title: 'Task',
    description: null,
    status: 'TODO',
    priority: 'MEDIUM',
    assigneeId: 'u1',
    dueDate: null,
    startDate: null,
    createdAt: '2026-02-18T00:00:00.000Z',
    project: { id: 'p1', name: 'Project', color: null },
    labelAssignments: [],
    _count: { comments: 0 },
    ...overrides,
  }
}

test('bucket: do today for overdue or today due', () => {
  const now = new Date('2026-02-18T12:00:00.000Z')
  const task = buildTask({ dueDate: '2026-02-18T00:00:00.000Z' })
  assert.equal(getSmartBucket(task, now), 'DO_TODAY')
})

test('bucket: do next week for next 7 days', () => {
  const now = new Date('2026-02-18T12:00:00.000Z')
  const task = buildTask({ dueDate: '2026-02-22T00:00:00.000Z' })
  assert.equal(getSmartBucket(task, now), 'DO_NEXT_WEEK')
})

test('bucket: recently assigned uses createdAt when no near due date', () => {
  const now = new Date('2026-02-18T12:00:00.000Z')
  const task = buildTask({ createdAt: '2026-02-17T00:00:00.000Z' })
  assert.equal(getSmartBucket(task, now), 'RECENTLY_ASSIGNED')
})

test('bucket: do later fallback', () => {
  const now = new Date('2026-02-18T12:00:00.000Z')
  const task = buildTask({ createdAt: '2026-02-01T00:00:00.000Z' })
  assert.equal(getSmartBucket(task, now), 'DO_LATER')
})

test('groupTasksByBucket returns all buckets', () => {
  const now = new Date('2026-02-18T12:00:00.000Z')
  const tasks = [
    buildTask({ id: 'a', dueDate: '2026-02-18T00:00:00.000Z' }),
    buildTask({ id: 'b', dueDate: '2026-02-21T00:00:00.000Z' }),
    buildTask({ id: 'c', createdAt: '2026-02-17T00:00:00.000Z' }),
    buildTask({ id: 'd', createdAt: '2026-01-01T00:00:00.000Z' }),
  ]
  const grouped = groupTasksByBucket(tasks, now)
  assert.equal(grouped.DO_TODAY.length, 1)
  assert.equal(grouped.DO_NEXT_WEEK.length, 1)
  assert.equal(grouped.RECENTLY_ASSIGNED.length, 1)
  assert.equal(grouped.DO_LATER.length, 1)
})

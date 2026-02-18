import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDashboardMetrics } from '../lib/my-tasks/analytics'
import type { MyTaskRecord } from '../lib/my-tasks/types'

function buildTask(id: string, overrides: Partial<MyTaskRecord> = {}): MyTaskRecord {
  return {
    id,
    title: `Task ${id}`,
    description: null,
    status: 'TODO',
    priority: 'MEDIUM',
    assigneeId: 'u1',
    dueDate: '2026-02-20T00:00:00.000Z',
    startDate: null,
    createdAt: '2026-02-18T00:00:00.000Z',
    project: { id: 'p1', name: 'Project A', color: null },
    labelAssignments: [],
    _count: { comments: 0 },
    ...overrides,
  }
}

test('buildDashboardMetrics returns expected aggregate counters', () => {
  const now = new Date('2026-02-18T12:00:00.000Z')
  const tasks = [
    buildTask('1', { status: 'DONE' }),
    buildTask('2', { status: 'IN_PROGRESS' }),
    buildTask('3', { status: 'TODO', dueDate: '2026-02-10T00:00:00.000Z' }),
  ]
  const metrics = buildDashboardMetrics(tasks, now)
  assert.equal(metrics.totalCompletedTasks, 1)
  assert.equal(metrics.totalIncompleteTasks, 2)
  assert.equal(metrics.totalOverdueTasks, 1)
  assert.equal(metrics.totalTasks, 3)
})

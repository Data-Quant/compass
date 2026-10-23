import assert from 'node:assert/strict'
import test from 'node:test'
import {
  maskInaccessibleTasks,
  OTHER_PROJECT_ID,
  projectParticipants,
  toAnalyticsTask,
} from '../lib/project-analytics-data'
import type { AnalyticsTask } from '../lib/project-analytics'

const task = (id: string, projectId: string): AnalyticsTask => ({
  id,
  projectId,
  parentTaskId: null,
  title: `Secret ${id}`,
  status: 'DONE',
  priority: 'MEDIUM',
  assigneeId: 'person',
  createdAt: '2026-01-01T00:00:00Z',
  completedAt: '2026-01-02T00:00:00Z',
  completedLate: false,
  dueDate: null,
  section: null,
  assistants: [],
  childCount: 0,
})

test('tasks outside the viewer projects lose title and project id', () => {
  const masked = maskInaccessibleTasks([task('a', 'mine'), task('b', 'hidden')], new Set(['mine']))
  assert.equal(masked[0].title, 'Secret a')
  assert.equal(masked[0].projectId, 'mine')
  assert.equal(masked[1].title, undefined)
  assert.equal(masked[1].projectId, OTHER_PROJECT_ID)
  assert.equal(JSON.stringify(masked[1]).includes('hidden'), false)
  const secret = { ...task('c', 'hidden'), parentTaskId: 'p', section: { id: 'sec-1', name: 'Secret section', isBacklog: false, isDone: true, orderIndex: 2 } }
  const [m] = maskInaccessibleTasks([secret], new Set())
  assert.equal(m.id, '')
  assert.equal(m.parentTaskId, '')
  assert.deepEqual(m.section, { id: '', name: '', isBacklog: false, isDone: true, orderIndex: 2 })
  assert.equal(/Secret|sec-1/.test(JSON.stringify(m)), false)
})

test('participants include the owner once and every member', () => {
  assert.deepEqual(projectParticipants({
    owner: { id: 'o', name: 'Owner' },
    members: [{ user: { id: 'o', name: 'Owner' } }, { user: { id: 'm', name: 'Member' } }],
  }), [{ id: 'o', name: 'Owner' }, { id: 'm', name: 'Member' }])
})

test('child count comes from the Prisma _count', () => {
  assert.deepEqual(toAnalyticsTask({ id: 'x', _count: { childTasks: 2 } }), { id: 'x', childCount: 2 })
})

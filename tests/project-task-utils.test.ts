import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildTaskShareUrl,
  getTaskStatusForSectionName,
  isProjectTaskDateRangeValid,
  isProjectTaskPriority,
  isProjectTaskStatus,
  parseProjectPriority,
  readSharedTaskId,
  shiftProjectTaskDateByCalendarDays,
  wouldCreateTaskParentCycle,
} from '../lib/project-task-utils'

test('project task section names map to task statuses', () => {
  assert.equal(getTaskStatusForSectionName('To Do'), 'TODO')
  assert.equal(getTaskStatusForSectionName('In Progress'), 'IN_PROGRESS')
  assert.equal(getTaskStatusForSectionName('Done'), 'DONE')
  assert.equal(getTaskStatusForSectionName('Research'), null)
})

test('project task status validator accepts only known statuses', () => {
  assert.equal(isProjectTaskStatus('TODO'), true)
  assert.equal(isProjectTaskStatus('IN_PROGRESS'), true)
  assert.equal(isProjectTaskStatus('DONE'), true)
  assert.equal(isProjectTaskStatus('BLOCKED'), false)
})

test('project task priority allows only the three documented levels', () => {
  assert.equal(isProjectTaskPriority('HIGH'), true)
  assert.equal(isProjectTaskPriority('MEDIUM'), true)
  assert.equal(isProjectTaskPriority('LOW'), true)
  assert.equal(isProjectTaskPriority('URGENT'), false)
})

test('bulk date shifts use calendar days and preserve the task date invariant', () => {
  const shifted = shiftProjectTaskDateByCalendarDays('2024-03-01T00:00:00.000Z', -1)

  assert.equal(shifted?.toISOString(), '2024-02-29T00:00:00.000Z')
  assert.equal(isProjectTaskDateRangeValid('2024-02-29T18:00:00.000Z', shifted), true)
  assert.equal(isProjectTaskDateRangeValid('2024-03-01T00:00:00.000Z', shifted), false)
})

test('task parents cannot create direct, descendant, or pre-existing cycles', () => {
  const tasks = [
    { id: 'root', parentTaskId: null },
    { id: 'child', parentTaskId: 'root' },
    { id: 'grandchild', parentTaskId: 'child' },
    { id: 'cycle-a', parentTaskId: 'cycle-b' },
    { id: 'cycle-b', parentTaskId: 'cycle-a' },
  ]

  assert.equal(wouldCreateTaskParentCycle('root', 'root', tasks), true)
  assert.equal(wouldCreateTaskParentCycle('root', 'grandchild', tasks), true)
  assert.equal(wouldCreateTaskParentCycle('grandchild', 'root', tasks), false)
  assert.equal(wouldCreateTaskParentCycle('unrelated', 'cycle-a', tasks), true)
  assert.equal(wouldCreateTaskParentCycle('root', null, tasks), false)
})

test('parseProjectPriority accepts the task priorities and rejects anything else', () => {
  assert.equal(parseProjectPriority(undefined), undefined)
  assert.equal(parseProjectPriority('HIGH'), 'HIGH')
  assert.equal(parseProjectPriority('URGENT'), null)
  assert.equal(parseProjectPriority('high'), null)
  assert.equal(parseProjectPriority(3), null)
})

test('buildTaskShareUrl links to the project page with the task open', () => {
  assert.equal(buildTaskShareUrl('https://compass.example', 'p1', 't1'), 'https://compass.example/projects/p1?task=t1')
  assert.equal(buildTaskShareUrl('https://c.example', 'p 1', 't/1'), 'https://c.example/projects/p%201?task=t%2F1')
})

test('readSharedTaskId returns a usable id or null', () => {
  assert.equal(readSharedTaskId(new URLSearchParams('task=abc')), 'abc')
  assert.equal(readSharedTaskId(new URLSearchParams('task=%20abc%20')), 'abc')
  assert.equal(readSharedTaskId(new URLSearchParams('')), null)
  assert.equal(readSharedTaskId(new URLSearchParams('task=')), null)
  assert.equal(readSharedTaskId(new URLSearchParams(`task=${'x'.repeat(65)}`)), null)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getTaskStatusForSectionName,
  isProjectTaskStatus,
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

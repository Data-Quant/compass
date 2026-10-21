import test from 'node:test'
import assert from 'node:assert/strict'
import type { TaskStatus } from '@prisma/client'
import { resolveParentTaskStatus } from '../lib/project-parent-completion'

const child = (status: TaskStatus, isBacklog = false) => ({ status, isBacklog })
const parent = (status: TaskStatus, isBacklog = false) => ({ status, isBacklog })

test('completes an open parent when every child is done', () => {
  assert.equal(resolveParentTaskStatus(parent('IN_PROGRESS'), [child('DONE'), child('DONE')]), 'DONE')
  assert.equal(resolveParentTaskStatus(parent('TODO'), [child('DONE')]), 'DONE')
})
test('leaves the parent alone while any child is open', () => {
  assert.equal(resolveParentTaskStatus(parent('IN_PROGRESS'), [child('DONE'), child('TODO')]), null)
})
test('reopens a done parent to In Progress when a child is open again', () => {
  assert.equal(resolveParentTaskStatus(parent('DONE'), [child('DONE'), child('IN_PROGRESS')]), 'IN_PROGRESS')
})
test('a parent with no counted children is never changed', () => {
  assert.equal(resolveParentTaskStatus(parent('TODO'), []), null)
  assert.equal(resolveParentTaskStatus(parent('TODO'), [child('DONE', true)]), null)
})
test('backlog children do not count toward completion', () => {
  assert.equal(resolveParentTaskStatus(parent('TODO'), [child('DONE'), child('TODO', true)]), 'DONE')
})
test('a backlog parent is never auto-promoted or reopened', () => {
  assert.equal(resolveParentTaskStatus(parent('TODO', true), [child('DONE')]), null)
})
test('an already-done parent with all children done needs no change', () => {
  assert.equal(resolveParentTaskStatus(parent('DONE'), [child('DONE')]), null)
})

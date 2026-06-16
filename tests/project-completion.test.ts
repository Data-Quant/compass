import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveProjectStatusForCompletion } from '../lib/project-completion'

test('promotes an active project to completed when all tasks are done', () => {
  assert.equal(resolveProjectStatusForCompletion('ACTIVE', 5, 5), 'COMPLETED')
})

test('does not change an active project that is not fully done', () => {
  assert.equal(resolveProjectStatusForCompletion('ACTIVE', 5, 4), null)
})

test('a project with no tasks is never auto-completed', () => {
  assert.equal(resolveProjectStatusForCompletion('ACTIVE', 0, 0), null)
})

test('already-completed project at 100% needs no change', () => {
  assert.equal(resolveProjectStatusForCompletion('COMPLETED', 5, 5), null)
})

test('reverts a completed project to active when work reopens (demote allowed)', () => {
  assert.equal(resolveProjectStatusForCompletion('COMPLETED', 5, 4, { allowDemote: true }), 'ACTIVE')
})

test('does not revert a completed project when demotion is disallowed (list self-heal)', () => {
  assert.equal(resolveProjectStatusForCompletion('COMPLETED', 5, 4, { allowDemote: false }), null)
})

test('never touches archived projects', () => {
  assert.equal(resolveProjectStatusForCompletion('ARCHIVED', 5, 5), null)
  assert.equal(resolveProjectStatusForCompletion('ARCHIVED', 5, 2, { allowDemote: true }), null)
})

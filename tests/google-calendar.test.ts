import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldIncludeExecutiveLeaveInviteForPosition } from '../lib/google-calendar'

test('executive leave invite rule includes principals, managers, and junior partners', () => {
  assert.equal(shouldIncludeExecutiveLeaveInviteForPosition('Principal'), true)
  assert.equal(shouldIncludeExecutiveLeaveInviteForPosition('Software Engineering Manager'), true)
  assert.equal(shouldIncludeExecutiveLeaveInviteForPosition('Junior Partner'), true)
  assert.equal(shouldIncludeExecutiveLeaveInviteForPosition('JP'), true)
})

test('executive leave invite rule excludes non-managerial positions', () => {
  assert.equal(shouldIncludeExecutiveLeaveInviteForPosition('Associate'), false)
  assert.equal(shouldIncludeExecutiveLeaveInviteForPosition('Senior Associate'), false)
  assert.equal(shouldIncludeExecutiveLeaveInviteForPosition('Analyst'), false)
  assert.equal(shouldIncludeExecutiveLeaveInviteForPosition(null), false)
})

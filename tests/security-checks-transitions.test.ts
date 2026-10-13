import test from 'node:test'
import assert from 'node:assert/strict'
import { isAllowedTransition, transitionError } from '../lib/security-checks/transitions'
import { rollUp } from '../lib/security-checks/rollup'

test('the §6 transition table allows exactly the listed moves', () => {
  assert.ok(isAllowedTransition('NOT_STARTED', 'IN_PROGRESS', 'SAVE_DRAFT'))
  assert.ok(isAllowedTransition('IN_PROGRESS', 'PENDING_REVIEW', 'SUBMIT'))
  assert.ok(isAllowedTransition('PENDING_REVIEW', 'VERIFIED', 'VERIFY'))
  assert.ok(isAllowedTransition('PENDING_REVIEW', 'REQUIRES_INFO', 'RETURN'))
  assert.ok(isAllowedTransition('REJECTED', 'PENDING_REVIEW', 'RESUBMIT'))
  assert.ok(isAllowedTransition('IN_PROGRESS', 'EXPIRED', 'EXPIRE_NO_SUBMISSION'))
  assert.ok(isAllowedTransition('REQUIRES_INFO', 'EXPIRED', 'EXPIRE_WINDOW_LAPSED'))
  assert.ok(isAllowedTransition('PENDING_REVIEW', 'EXPIRED', 'EXPIRE_REVIEW'))
  assert.ok(isAllowedTransition('VERIFIED', 'PENDING_REVIEW', 'REOPEN'))
  assert.ok(isAllowedTransition('REJECTED', 'EXEMPT', 'EXEMPT'))
  assert.ok(isAllowedTransition('EXPIRED', 'EXEMPT', 'EXEMPT_EXPIRED'))
  assert.ok(isAllowedTransition('PENDING_REVIEW', 'NOT_APPLICABLE', 'NOT_APPLICABLE'))
  assert.ok(isAllowedTransition('NOT_STARTED', 'CANCELLED', 'CANCEL'))
})

test('anything not listed is rejected', () => {
  assert.ok(!isAllowedTransition('NOT_STARTED', 'VERIFIED', 'VERIFY'))
  assert.ok(!isAllowedTransition('IN_PROGRESS', 'NOT_STARTED', 'SAVE_DRAFT'))
  assert.ok(!isAllowedTransition('VERIFIED', 'EXEMPT', 'EXEMPT'))
  assert.ok(!isAllowedTransition('EXPIRED', 'PENDING_REVIEW', 'REOPEN'))
  assert.ok(!isAllowedTransition('EXEMPT', 'CANCELLED', 'CANCEL'))
  assert.ok(!isAllowedTransition('CANCELLED', 'NOT_APPLICABLE', 'NOT_APPLICABLE'))
  assert.ok(!isAllowedTransition('PENDING_REVIEW', 'PENDING_REVIEW', 'SUBMIT'))
  assert.match(transitionError('VERIFIED', 'REJECTED', 'RETURN') ?? '', /cannot move/)
  assert.equal(transitionError('PENDING_REVIEW', 'VERIFIED', 'VERIFY'), null)
})

test('roll-up follows strict precedence', () => {
  assert.equal(rollUp(['VERIFIED', 'PENDING_REVIEW', 'REJECTED']), 'PENDING_REVIEW')
  assert.equal(rollUp(['VERIFIED', 'REQUIRES_INFO', 'REJECTED']), 'REJECTED')
  assert.equal(rollUp(['VERIFIED', 'REQUIRES_INFO', 'NOT_APPLICABLE']), 'REQUIRES_INFO')
  assert.equal(rollUp(['VERIFIED', 'NOT_APPLICABLE']), 'VERIFIED')
  assert.equal(rollUp(['NOT_APPLICABLE', 'NOT_APPLICABLE']), 'NOT_APPLICABLE')
})

test('all-N/A never rolls up to Verified; open subtasks and empty lists give no roll-up', () => {
  assert.notEqual(rollUp(['NOT_APPLICABLE']), 'VERIFIED')
  assert.equal(rollUp(['OPEN', 'VERIFIED']), null)
  assert.equal(rollUp([]), null)
})

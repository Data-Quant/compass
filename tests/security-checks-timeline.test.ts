import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../lib/security-checks/dates'
import {
  canEmployeeEdit,
  canExemptExpired,
  canReopen,
  canReview,
  checkSubmission,
  LATEST_FINAL_DAYS,
  pendingExpiry,
  returnOutcome,
  reviewDeadlineOf,
  scheduledCloseOf,
  taskCloseOf,
  wrapUpEndOf,
  type TaskTimelineState,
} from '../lib/security-checks/timeline'

// D = end of 15 Nov 2026 in Karachi.
const D = new Date('2026-11-15T18:59:59.999Z')
const at = (days: number) => addDays(D, days)
const task = (overrides: Partial<TaskTimelineState> = {}): TaskTimelineState => ({
  status: 'NOT_STARTED',
  deadline: D,
  resubmitDueAt: null,
  finalRoundAt: null,
  expiryReason: null,
  ...overrides,
})

test('task close is D+7, wrap-up D+21, cycle scheduled close deadline+7', () => {
  assert.equal(taskCloseOf(D).toISOString(), at(7).toISOString())
  assert.equal(wrapUpEndOf(D).toISOString(), at(21).toISOString())
  assert.equal(scheduledCloseOf(D).toISOString(), at(7).toISOString())
})

test('first submission is allowed up to D and refused after', () => {
  assert.deepEqual(checkSubmission(task(), at(-1)), { ok: true, isResubmission: false, isFinal: false })
  assert.deepEqual(checkSubmission(task({ status: 'IN_PROGRESS' }), D), { ok: true, isResubmission: false, isFinal: false })
  assert.equal(checkSubmission(task(), new Date(D.getTime() + 1)).ok, false)
})

test('no submission by D expires with reason no-submission', () => {
  assert.equal(pendingExpiry(task(), D), null)
  assert.deepEqual(pendingExpiry(task({ status: 'IN_PROGRESS' }), at(0.01)), { reason: 'NO_SUBMISSION', flagUnreviewed: false })
})

test('a return verdict gives the later of D or verdict + 7 days', () => {
  const early = returnOutcome(task(), 'REJECTED', at(-20))
  assert.equal(early.status, 'REJECTED')
  assert.equal(early.resubmitDueAt?.toISOString(), D.toISOString())
  const late = returnOutcome(task(), 'REQUIRES_INFO', at(10))
  assert.equal(late.resubmitDueAt?.toISOString(), at(17).toISOString())
})

test('a resubmission inside the window before task close is not final; after task close it is the final round', () => {
  const returned = task({ status: 'REJECTED', resubmitDueAt: at(9) })
  assert.deepEqual(checkSubmission(returned, at(6)), { ok: true, isResubmission: true, isFinal: false })
  assert.deepEqual(checkSubmission(returned, at(8)), { ok: true, isResubmission: true, isFinal: true })
  assert.equal(checkSubmission(returned, at(9.5)).ok, false)
})

test('the resubmission window lapsing expires the task', () => {
  const returned = task({ status: 'REQUIRES_INFO', resubmitDueAt: at(3) })
  assert.equal(pendingExpiry(returned, at(3)), null)
  assert.deepEqual(pendingExpiry(returned, at(3.1)), { reason: 'WINDOW_LAPSED', flagUnreviewed: false })
})

test('pending review survives task close and expires unreviewed after D+21 (flagged)', () => {
  const pending = task({ status: 'PENDING_REVIEW' })
  assert.equal(pendingExpiry(pending, at(8)), null)
  assert.equal(pendingExpiry(pending, at(21)), null)
  assert.deepEqual(pendingExpiry(pending, at(21.01)), { reason: 'UNREVIEWED', flagUnreviewed: true })
})

test('a final resubmission must be reviewed by the later of D+21 or 14 days after submission', () => {
  const finalAt = at(15)
  const pending = task({ status: 'PENDING_REVIEW', finalRoundAt: finalAt })
  assert.equal(reviewDeadlineOf(pending).toISOString(), at(29).toISOString())
  assert.ok(canReview(pending, at(28)))
  assert.deepEqual(pendingExpiry(pending, at(29.5)), { reason: 'UNREVIEWED', flagUnreviewed: true })
  const earlyFinal = task({ status: 'PENDING_REVIEW', finalRoundAt: at(7.5) })
  assert.equal(reviewDeadlineOf(earlyFinal).toISOString(), at(21.5).toISOString())
})

test('a return verdict on the final resubmission expires the task immediately', () => {
  const outcome = returnOutcome(task({ finalRoundAt: at(9) }), 'REJECTED', at(12))
  assert.deepEqual(outcome, { status: 'EXPIRED', expiryReason: 'REJECTED_POST_CLOSE', resubmitDueAt: null })
})

test('only one more round after task close: a second post-close resubmission is refused', () => {
  const returned = task({ status: 'REJECTED', resubmitDueAt: at(25), finalRoundAt: at(10) })
  assert.equal(checkSubmission(returned, at(20)).ok, false)
})

test('worst case finishes by D+42: verdict at D+21 → resubmit by D+28 → review by D+42', () => {
  const verdict = returnOutcome(task(), 'REJECTED', at(21))
  assert.equal(verdict.resubmitDueAt?.toISOString(), at(28).toISOString())
  const finalRound = task({ status: 'PENDING_REVIEW', finalRoundAt: at(28) })
  assert.equal(reviewDeadlineOf(finalRound).toISOString(), at(LATEST_FINAL_DAYS).toISOString())
})

test('employee may edit drafts before D and returned tasks inside the window only', () => {
  assert.ok(canEmployeeEdit(task(), at(-1)))
  assert.ok(!canEmployeeEdit(task(), at(1)))
  assert.ok(canEmployeeEdit(task({ status: 'REJECTED', resubmitDueAt: at(4) }), at(3)))
  assert.ok(!canEmployeeEdit(task({ status: 'PENDING_REVIEW' }), at(-1)))
  assert.ok(!canEmployeeEdit(task({ status: 'VERIFIED' }), at(-1)))
})

test('reopen allowed for Verified until wrap-up end; expired no-submission exemptable until task close', () => {
  assert.ok(canReopen(task({ status: 'VERIFIED' }), at(21)))
  assert.ok(!canReopen(task({ status: 'VERIFIED' }), at(21.1)))
  assert.ok(!canReopen(task({ status: 'EXPIRED' }), at(1)))
  const expired = task({ status: 'EXPIRED', expiryReason: 'NO_SUBMISSION' })
  assert.ok(canExemptExpired(expired, at(7)))
  assert.ok(!canExemptExpired(expired, at(7.1)))
  assert.ok(!canExemptExpired(task({ status: 'EXPIRED', expiryReason: 'UNREVIEWED' }), at(1)))
})

test('final and exempt tasks never expire', () => {
  for (const status of ['VERIFIED', 'EXEMPT', 'NOT_APPLICABLE', 'CANCELLED', 'EXPIRED'] as const) {
    assert.equal(pendingExpiry(task({ status }), at(100)), null)
  }
})

test('a Verified task reopened late gets a fresh 14-day review window (still within D+42)', () => {
  const reopened = task({ status: 'PENDING_REVIEW', reopenedAt: at(20) })
  assert.equal(reviewDeadlineOf(reopened).toISOString(), at(34).toISOString())
  assert.equal(pendingExpiry(reopened, at(25)), null)
  assert.equal(reviewDeadlineOf(task({ status: 'PENDING_REVIEW', reopenedAt: at(1) })).toISOString(), at(21).toISOString())
})

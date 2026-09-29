import test from 'node:test'
import assert from 'node:assert/strict'
import { effectiveStatus, isFinalStatus, pendingSystemTransitions, transition, type KpiStateLike } from '../lib/kpi/state-machine'
import type { KpiStatusValue } from '../lib/kpi/view-types'

const month = {
  goalsLockAt: new Date('2026-10-14T18:59:59.999Z'),
  claimsDueAt: new Date('2026-11-04T18:59:59.999Z'),
  responseDueAt: new Date('2026-11-13T18:59:59.999Z'),
}
const beforeLock = new Date('2026-10-10T08:00:00Z')
const afterLock = new Date('2026-10-20T08:00:00Z')
const afterClaims = new Date('2026-11-06T08:00:00Z')
const afterResponse = new Date('2026-11-20T08:00:00Z')
const state = (status: KpiStatusValue, extra: Partial<KpiStateLike> = {}): KpiStateLike => ({ status, appealUsedAt: null, decidedById: null, ...extra })

test('drafts can be edited or discarded until the lock instant, inclusive', () => {
  assert.deepEqual(transition(state('DRAFT'), { type: 'EDIT' }, month, beforeLock), { ok: true, to: 'DRAFT' })
  assert.deepEqual(transition(state('DRAFT'), { type: 'DISCARD' }, month, month.goalsLockAt), { ok: true, to: 'CANCELLED' })
  const late = transition(state('DRAFT'), { type: 'EDIT' }, month, new Date(month.goalsLockAt.getTime() + 1))
  assert.equal(late.ok, false)
  assert.equal(transition(state('LOCKED'), { type: 'EDIT' }, month, beforeLock).ok, false)
})

test('locking happens only after the lock instant', () => {
  assert.equal(transition(state('DRAFT'), { type: 'LOCK' }, month, month.goalsLockAt).ok, false)
  assert.deepEqual(transition(state('DRAFT'), { type: 'LOCK' }, month, afterLock), { ok: true, to: 'LOCKED' })
})

test('claims are accepted until the claims deadline', () => {
  assert.deepEqual(transition(state('LOCKED'), { type: 'CLAIM_DONE' }, month, afterLock), { ok: true, to: 'CLAIMED_DONE' })
  assert.deepEqual(transition(state('LOCKED'), { type: 'CLAIM_NOT_DONE' }, month, month.claimsDueAt), { ok: true, to: 'NOT_DONE' })
  assert.equal(transition(state('LOCKED'), { type: 'CLAIM_DONE' }, month, afterClaims).ok, false)
  assert.equal(transition(state('DRAFT'), { type: 'CLAIM_DONE' }, month, afterLock).ok, false)
})

test('a claim can be revised only before a decision and the deadline', () => {
  assert.deepEqual(transition(state('CLAIMED_DONE'), { type: 'REVISE_CLAIM' }, month, afterLock), { ok: true, to: 'CLAIMED_DONE' })
  assert.equal(transition(state('CLAIMED_DONE', { decidedById: 'oum' }), { type: 'REVISE_CLAIM' }, month, afterLock).ok, false)
  assert.equal(transition(state('CLAIMED_DONE'), { type: 'REVISE_CLAIM' }, month, afterClaims).ok, false)
})

test('verifier decisions apply only to submitted claims', () => {
  for (const decision of ['VERIFIED', 'NEEDS_INFO', 'REJECTED'] as const) {
    assert.deepEqual(transition(state('CLAIMED_DONE'), { type: 'DECIDE', decision }, month, afterResponse), { ok: true, to: decision })
  }
  assert.equal(transition(state('LOCKED'), { type: 'DECIDE', decision: 'VERIFIED' }, month, afterLock).ok, false)
})

test('needs-info replies and one appeal within the response window', () => {
  assert.deepEqual(transition(state('NEEDS_INFO'), { type: 'RESPOND' }, month, afterClaims), { ok: true, to: 'CLAIMED_DONE' })
  assert.equal(transition(state('NEEDS_INFO'), { type: 'RESPOND' }, month, afterResponse).ok, false)
  assert.deepEqual(transition(state('REJECTED'), { type: 'APPEAL' }, month, afterClaims), { ok: true, to: 'APPEALED' })
  assert.equal(transition(state('REJECTED', { appealUsedAt: afterClaims }), { type: 'APPEAL' }, month, afterClaims).ok, false)
  assert.equal(transition(state('REJECTED'), { type: 'APPEAL' }, month, afterResponse).ok, false)
  assert.deepEqual(transition(state('APPEALED'), { type: 'FINAL_DECISION', decision: 'NOT_VERIFIED' }, month, afterResponse), { ok: true, to: 'NOT_VERIFIED' })
  assert.equal(transition(state('REJECTED'), { type: 'FINAL_DECISION', decision: 'VERIFIED' }, month, afterClaims).ok, false)
})

test('approved change requests apply only to locked, unfinished KPIs', () => {
  assert.deepEqual(transition(state('LOCKED'), { type: 'APPROVE_CANCEL' }, month, afterLock), { ok: true, to: 'CANCELLED' })
  assert.deepEqual(transition(state('NEEDS_INFO'), { type: 'APPROVE_EDIT' }, month, afterClaims), { ok: true, to: 'NEEDS_INFO' })
  assert.equal(transition(state('DRAFT'), { type: 'APPROVE_CANCEL' }, month, beforeLock).ok, false)
  assert.equal(transition(state('VERIFIED'), { type: 'APPROVE_EDIT' }, month, afterResponse).ok, false)
})

test('HR overrides move one final result to a different final result', () => {
  assert.deepEqual(transition(state('NOT_VERIFIED'), { type: 'HR_OVERRIDE', to: 'VERIFIED' }, month, afterResponse), { ok: true, to: 'VERIFIED' })
  assert.equal(transition(state('LOCKED'), { type: 'HR_OVERRIDE', to: 'VERIFIED' }, month, afterLock).ok, false)
  assert.equal(transition(state('VERIFIED'), { type: 'HR_OVERRIDE', to: 'LOCKED' }, month, afterResponse).ok, false)
  assert.equal(transition(state('VERIFIED'), { type: 'HR_OVERRIDE', to: 'VERIFIED' }, month, afterResponse).ok, false)
})

test('system transitions chain and are never verifications', () => {
  assert.deepEqual(pendingSystemTransitions('DRAFT', month, beforeLock), [])
  assert.deepEqual(pendingSystemTransitions('DRAFT', month, afterClaims).map((s) => [s.from, s.to, s.reason]), [
    ['DRAFT', 'LOCKED', 'GOALS_LOCK'],
    ['LOCKED', 'NOT_DONE', 'CLAIMS_DEADLINE'],
  ])
  assert.equal(effectiveStatus('NEEDS_INFO', month, afterResponse), 'NOT_VERIFIED')
  assert.equal(effectiveStatus('REJECTED', month, afterResponse), 'NOT_VERIFIED')
  assert.equal(effectiveStatus('CLAIMED_DONE', month, afterResponse), 'CLAIMED_DONE')
  assert.equal(effectiveStatus('APPEALED', month, afterResponse), 'APPEALED')
  assert.equal(effectiveStatus('LOCKED', month, afterLock), 'LOCKED')
})

test('final statuses', () => {
  assert.deepEqual((['NOT_DONE', 'VERIFIED', 'NOT_VERIFIED', 'CANCELLED', 'LOCKED'] as const).map(isFinalStatus), [true, true, true, true, false])
})

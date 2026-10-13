import test from 'node:test'
import assert from 'node:assert/strict'
import { capabilitiesOf, canDownloadEvidence, canViewEvidence, type SecurityActor } from '../lib/security-checks/access'
import { peerUnavailableReason, selfReviewDecision, type PeerAdmin } from '../lib/security-checks/self-review'

const securityAdmin: SecurityActor = { id: 'sa1', role: 'SECURITY', isConsoleAdmin: false }
const consoleAdmin: SecurityActor = { id: 'ca1', role: 'EMPLOYEE', isConsoleAdmin: true }
const hr: SecurityActor = { id: 'hr1', role: 'HR', isConsoleAdmin: false }
const employee: SecurityActor = { id: 'e1', role: 'EMPLOYEE', isConsoleAdmin: false }

test('§13 matrix: Security Admin can do everything administrative', () => {
  assert.deepEqual(capabilitiesOf(securityAdmin), {
    console: true,
    manageCampaigns: true,
    review: true,
    manageTasks: true,
    exportCsv: true,
    auditLog: true,
    manageGrants: true,
  })
})

test('§13 matrix: Console Admin is read-only console access', () => {
  assert.deepEqual(capabilitiesOf(consoleAdmin), {
    console: true,
    manageCampaigns: false,
    review: false,
    manageTasks: false,
    exportCsv: false,
    auditLog: false,
    manageGrants: false,
  })
})

test('HR and employees get no console access without a grant', () => {
  assert.equal(capabilitiesOf(hr).console, false)
  assert.equal(capabilitiesOf(employee).console, false)
})

test('evidence: owner views + downloads own; console admin views only; security admin views + downloads', () => {
  assert.ok(canViewEvidence(employee, 'e1'))
  assert.ok(canDownloadEvidence(employee, 'e1'))
  assert.ok(!canViewEvidence(employee, 'e2'))
  assert.ok(canViewEvidence(consoleAdmin, 'e2'))
  assert.ok(!canDownloadEvidence(consoleAdmin, 'e2'))
  assert.ok(canDownloadEvidence(securityAdmin, 'e2'))
  assert.ok(!canViewEvidence(hr, 'e2'))
})

// Mon 2 Nov 2026 … business-day arithmetic in Karachi time.
const now = new Date('2026-11-13T06:00:00Z') // Fri
const peer = (overrides: Partial<PeerAdmin> = {}): PeerAdmin => ({
  id: 'sa2',
  name: 'Peer Admin',
  active: true,
  onLeave: false,
  lastReviewActionAt: new Date('2026-11-12T06:00:00Z'),
  oldestWaitingSince: null,
  ...overrides,
})

test('reviewing someone else is never a self-review', () => {
  assert.deepEqual(selfReviewDecision('sa1', 'e1', [peer()], now), { selfReview: false })
})

test('self-review is refused while the other admin is available', () => {
  const decision = selfReviewDecision('sa1', 'sa1', [peer()], now)
  assert.equal(decision.selfReview && !decision.allowed, true)
})

test('self-review is allowed when the other admin is deactivated or on leave', () => {
  for (const unavailable of [peer({ active: false }), peer({ onLeave: true })]) {
    const decision = selfReviewDecision('sa1', 'sa1', [unavailable], now)
    assert.equal(decision.selfReview && decision.allowed, true)
  }
})

test('no review action for 5 business days while items wait makes the peer unavailable', () => {
  const waiting = new Date('2026-11-05T06:00:00Z') // Thu
  const quiet = peer({ lastReviewActionAt: new Date('2026-11-02T06:00:00Z'), oldestWaitingSince: waiting })
  // Thu 5 → Fri 13 = Fri6, Mon9, Tue10, Wed11, Thu12, Fri13 = 6 business days
  assert.equal(peerUnavailableReason(quiet, now), 'NO_RECENT_REVIEWS')
  assert.equal(peerUnavailableReason(quiet, new Date('2026-11-11T06:00:00Z')), null)
  // Nothing waiting → never "inactive", however long ago the last review was.
  assert.equal(peerUnavailableReason(peer({ lastReviewActionAt: null, oldestWaitingSince: null }), now), null)
})

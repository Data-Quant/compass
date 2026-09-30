import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultWindow, kpiContribution, leadStats, type KpiHistory } from '../lib/kpi/lead-history'

const LOCK = { action: 'GOALS_LOCK', toStatus: 'LOCKED' }
const CLAIM = { action: 'CLAIM', toStatus: 'CLAIMED_DONE' }
const decide = (toStatus: string) => ({ action: 'DECIDE', toStatus })

test('a KPI counts as locked, claimed, decided and rejected at first decision from its status and events', () => {
  const appealedThenVerified: KpiHistory = {
    setterId: 'lead', status: 'VERIFIED',
    events: [LOCK, CLAIM, decide('REJECTED'), { action: 'APPEAL', toStatus: 'APPEALED' }, { action: 'FINAL_DECISION', toStatus: 'VERIFIED' }],
  }
  assert.deepEqual(kpiContribution(appealedThenVerified), {
    locked: 1, claimedDone: 1, claimedNotDone: 0, verified: 1, needsInfo: 0, rejectedAtFirstDecision: 1, decided: 1, appealed: 1, finallyNotVerified: 0,
  })
  const askedFirst = kpiContribution({ setterId: 'lead', status: 'REJECTED', events: [LOCK, CLAIM, decide('NEEDS_INFO'), { action: 'RESPOND', toStatus: 'CLAIMED_DONE' }, decide('REJECTED')] })
  assert.deepEqual([askedFirst.needsInfo, askedFirst.rejectedAtFirstDecision, askedFirst.decided], [1, 0, 1])
  assert.equal(kpiContribution({ setterId: 'lead', status: 'CANCELLED', events: [{ action: 'DISCARD', toStatus: 'CANCELLED' }] }).locked, 0)
  assert.equal(kpiContribution({ setterId: 'lead', status: 'CANCELLED', events: [LOCK, { action: 'CHANGE_APPROVED', toStatus: 'CANCELLED' }] }).locked, 1)
  const unclaimed = kpiContribution({ setterId: 'lead', status: 'NOT_DONE', events: [LOCK, { action: 'CLAIMS_DEADLINE', toStatus: 'NOT_DONE' }] })
  assert.deepEqual([unclaimed.locked, unclaimed.claimedNotDone], [1, 0])
  assert.equal(kpiContribution({ setterId: 'lead', status: 'LOCKED', events: [] }).locked, 1)
})

test('rates, and the flag at a 25% rejection rate with at least four decided claims', () => {
  const kpi = (first: 'VERIFIED' | 'REJECTED'): KpiHistory => ({ setterId: 'lead', status: first, events: [LOCK, CLAIM, decide(first)] })
  const four = leadStats([kpi('REJECTED'), kpi('VERIFIED'), kpi('VERIFIED'), kpi('VERIFIED')]).get('lead')!
  assert.deepEqual([four.decided, four.rejectionRate, four.claimRate, four.flagged], [4, 0.25, 1, true])
  assert.equal(leadStats([kpi('REJECTED'), kpi('VERIFIED'), kpi('VERIFIED')]).get('lead')!.flagged, false)
  assert.equal(leadStats([kpi('REJECTED'), kpi('VERIFIED'), kpi('VERIFIED'), kpi('VERIFIED'), kpi('VERIFIED')]).get('lead')!.flagged, false)
  const idle = leadStats([{ setterId: 'lead', status: 'DRAFT', events: [] }]).get('lead')!
  assert.deepEqual([idle.claimRate, idle.rejectionRate, idle.flagged], [null, null, false])
})

test('the default window is the current Karachi month and the two before it', () => {
  assert.deepEqual(defaultWindow(new Date('2026-01-15T00:00:00Z')), { fromMonth: '2025-11', toMonth: '2026-01' })
  assert.deepEqual(defaultWindow(new Date('2026-09-30T20:00:00Z')), { fromMonth: '2026-08', toMonth: '2026-10' }) // 01:00 on 1 October in Karachi
})

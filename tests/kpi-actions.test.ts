import test from 'node:test'
import assert from 'node:assert/strict'
import { availableActions } from '../lib/kpi/actions'
import type { KpiActor, KpiRef } from '../lib/kpi/permissions'
import type { KpiStateLike } from '../lib/kpi/state-machine'
import type { KpiStatusValue } from '../lib/kpi/view-types'

const month = {
  goalsLockAt: new Date('2026-10-14T18:59:59.999Z'),
  claimsDueAt: new Date('2026-11-04T18:59:59.999Z'),
  responseDueAt: new Date('2026-11-13T18:59:59.999Z'),
}
const afterLock = new Date('2026-10-20T08:00:00Z')
const afterClaims = new Date('2026-11-06T08:00:00Z')
const actor = (id: string, role: KpiActor['role'] = 'EMPLOYEE', position = 'Analyst'): KpiActor => ({ id, role, position, departmentKey: 'product', grants: [] })
const lead = actor('lead', 'EMPLOYEE', 'Lead')
const member = actor('member')
const partner = actor('partner', 'EMPLOYEE', 'Partner')
const teamKpi: KpiRef = { scope: 'TEAM', setterId: 'lead', departmentKey: null, assigneeIds: ['member'], claimedById: null }
const deptKpi: KpiRef = { scope: 'DEPARTMENT', setterId: 'partner', departmentKey: 'product', assigneeIds: ['lead'], claimedById: null }
const state = (status: KpiStatusValue, extra: Partial<KpiStateLike> = {}): KpiStateLike => ({ status, appealUsedAt: null, decidedById: null, ...extra })

test('the team lead can claim a locked team KPI until the claims deadline; its owner cannot', () => {
  assert.equal(availableActions(lead, teamKpi, state('LOCKED'), month, afterLock, false).claim, true)
  assert.equal(availableActions(lead, teamKpi, state('LOCKED'), month, afterClaims, false).claim, false)
  assert.equal(availableActions(member, teamKpi, state('LOCKED'), month, afterLock, false).claim, false)
})

test('department KPIs are claimed by their owners, not by the Partner who set them', () => {
  assert.equal(availableActions(lead, deptKpi, state('LOCKED'), month, afterLock, false).claim, true)
  assert.equal(availableActions(partner, deptKpi, state('LOCKED'), month, afterLock, false).claim, false)
  assert.equal(availableActions(partner, deptKpi, state('LOCKED'), month, afterLock, false).requestChange, true)
})

test('an undecided claim can be revised; a decided one cannot', () => {
  assert.equal(availableActions(lead, teamKpi, state('CLAIMED_DONE'), month, afterLock, false).claim, true)
  assert.equal(availableActions(lead, teamKpi, state('CLAIMED_DONE', { decidedById: 'v' }), month, afterLock, false).claim, false)
})

test('replies, one appeal, and evidence uploads while either is open', () => {
  const reply = availableActions(lead, teamKpi, state('NEEDS_INFO'), month, afterClaims, false)
  assert.deepEqual([reply.respond, reply.appeal, reply.uploadEvidence], [true, false, true])
  const appeal = availableActions(lead, teamKpi, state('REJECTED'), month, afterClaims, false)
  assert.deepEqual([appeal.respond, appeal.appeal], [false, true])
  assert.equal(availableActions(lead, teamKpi, state('REJECTED', { appealUsedAt: afterClaims }), month, afterClaims, false).appeal, false)
  assert.equal(availableActions(lead, teamKpi, state('VERIFIED'), month, afterClaims, false).uploadEvidence, false)
})

test('change requests need a locked, unfinished KPI and no other pending request', () => {
  assert.equal(availableActions(lead, teamKpi, state('LOCKED'), month, afterLock, false).requestChange, true)
  assert.equal(availableActions(lead, teamKpi, state('LOCKED'), month, afterLock, true).requestChange, false)
  assert.equal(availableActions(lead, teamKpi, state('DRAFT'), month, afterLock, false).requestChange, false)
  assert.equal(availableActions(lead, teamKpi, state('VERIFIED'), month, afterClaims, false).requestChange, false)
  assert.equal(availableActions(member, teamKpi, state('LOCKED'), month, afterLock, false).requestChange, false)
})

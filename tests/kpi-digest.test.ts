import test from 'node:test'
import assert from 'node:assert/strict'
import { sameCalendarDate, workingDayBefore } from '../lib/kpi/calendar'
import { buildDigests, type DigestInput, type DigestItem, type DigestKpi } from '../lib/kpi/digest'
import type { KpiActor } from '../lib/kpi/permissions'
import type { KpiGrantRoleValue } from '../lib/kpi/view-types'

const OCTOBER_DEADLINES = {
  claimsDueAt: new Date('2026-11-04T18:59:59.999Z'),
  verifyDueAt: new Date('2026-11-11T18:59:59.999Z'),
  responseDueAt: new Date('2026-11-13T18:59:59.999Z'),
  targetFinalAt: new Date('2026-11-17T18:59:59.999Z'),
}
const kpi = (id: string, overrides: Partial<DigestKpi> = {}): DigestKpi => ({
  id, title: `KPI ${id}`, scope: 'TEAM', setterId: 'lead', departmentKey: null, assigneeIds: ['member'], claimedById: null,
  status: 'LOCKED', decidedAt: null, appealUsed: false, ...OCTOBER_DEADLINES, ...overrides,
})
const actor = (id: string, role: KpiActor['role'] = 'EMPLOYEE', grants: KpiGrantRoleValue[] = []): KpiActor => ({
  id, role, position: 'Analyst', departmentKey: 'product', grants,
})
const input = (now: string, overrides: Partial<DigestInput> = {}): DigestInput => ({
  now: new Date(now),
  currentMonth: { monthKey: '2026-10', goalsLockAt: new Date('2026-10-14T18:59:59.999Z') },
  teamSetterIds: ['lead', 'lead2'],
  teamSettersWithKpis: new Set(['lead2']),
  departmentSetterIds: ['partner'],
  departmentsWithoutKpis: ['Product'],
  kpis: [],
  pendingChanges: [],
  verifiers: [actor('verifier', 'EMPLOYEE', ['VERIFIER']), actor('hr', 'HR')],
  hrIds: ['hr'],
  lateMonths: [],
  ...overrides,
})
const kinds = (digests: Map<string, DigestItem[]>, userId: string) => (digests.get(userId) ?? []).map((item) => item.kind)

test('the working day before skips weekends, and calendar dates compare by day', () => {
  assert.deepEqual(workingDayBefore({ year: 2026, month: 11, day: 2 }), { year: 2026, month: 10, day: 30 })
  assert.deepEqual(workingDayBefore({ year: 2026, month: 11, day: 4 }), { year: 2026, month: 11, day: 3 })
  assert.equal(sameCalendarDate({ year: 2026, month: 11, day: 3 }, { year: 2026, month: 11, day: 3 }), true)
  assert.equal(sameCalendarDate({ year: 2026, month: 11, day: 3 }, { year: 2026, month: 11, day: 4 }), false)
})

test('on working days 1 and 4 before the lock, setters without KPIs are reminded', () => {
  const first = buildDigests(input('2026-10-01T04:00:00Z'))
  assert.deepEqual(kinds(first, 'lead'), ['SET_KPIS'])
  assert.deepEqual(kinds(first, 'lead2'), [])
  assert.deepEqual(kinds(first, 'partner'), ['DEPARTMENTS_WITHOUT_KPIS'])
  assert.match(first.get('partner')?.[0].text ?? '', /Product/)
  assert.equal(buildDigests(input('2026-10-02T04:00:00Z')).size, 0)
  assert.deepEqual(kinds(buildDigests(input('2026-10-06T04:00:00Z')), 'lead'), ['SET_KPIS'])
  const lockedEarly = { currentMonth: { monthKey: '2026-10', goalsLockAt: new Date('2026-10-05T18:59:59.999Z') } }
  assert.equal(buildDigests(input('2026-10-06T04:00:00Z', lockedEarly)).size, 0)
})

test('claimers are reminded the working day before claims close', () => {
  const kpis = [kpi('a'), kpi('b', { scope: 'DEPARTMENT', setterId: 'partner', departmentKey: 'product', assigneeIds: ['lead', 'jp'] })]
  const due = buildDigests(input('2026-11-03T04:00:00Z', { kpis }))
  assert.deepEqual(kinds(due, 'lead'), ['CLAIMS_DUE'])
  assert.match(due.get('lead')?.[0].text ?? '', /Claim 2 KPIs .*KPI a, KPI b/)
  assert.deepEqual(kinds(due, 'jp'), ['CLAIMS_DUE'])
  assert.deepEqual(kinds(due, 'partner'), [])
  assert.equal(buildDigests(input('2026-11-02T04:00:00Z', { kpis })).size, 0)
  assert.deepEqual(kinds(buildDigests(input('2026-11-03T04:00:00Z', { kpis: [kpi('a', { status: 'CLAIMED_DONE' })] })), 'lead'), [])
})

test('a needs-info or rejected claim reaches its claimer; an appealed one does not', () => {
  const asked = [kpi('a', { status: 'NEEDS_INFO', claimedById: 'lead', decidedAt: new Date('2026-11-05T10:00:00Z') })]
  assert.deepEqual(kinds(buildDigests(input('2026-11-06T04:00:00Z', { kpis: asked })), 'lead'), ['RESPONSE_NEEDED'])
  const appealed = [kpi('a', { status: 'REJECTED', claimedById: 'lead', appealUsed: true, decidedAt: new Date('2026-11-05T10:00:00Z') })]
  assert.deepEqual(kinds(buildDigests(input('2026-11-06T04:00:00Z', { kpis: appealed })), 'lead'), [])
})

test('verifiers hear about claims and change requests they may decide, never their own', () => {
  const kpis = [kpi('a', { status: 'CLAIMED_DONE', claimedById: 'lead' }), kpi('b', { status: 'APPEALED', claimedById: 'lead' })]
  const verifiers = [actor('verifier', 'EMPLOYEE', ['VERIFIER']), actor('hr', 'HR'), actor('lead', 'EMPLOYEE', ['VERIFIER'])]
  const digests = buildDigests(input('2026-11-05T04:00:00Z', { kpis, verifiers, pendingChanges: [{ kpiId: 'a', requestedById: 'lead' }] }))
  assert.deepEqual(kinds(digests, 'verifier'), ['VERIFY_QUEUE', 'CHANGE_REQUESTS'])
  assert.equal(digests.get('verifier')?.[0].text, '2 claims waiting for verification')
  assert.deepEqual(kinds(digests, 'hr'), ['VERIFY_QUEUE', 'CHANGE_REQUESTS'])
  assert.deepEqual(kinds(digests, 'lead'), [])
})

test('HR hears about overdue verification and months that are not final', () => {
  const kpis = [kpi('a', { status: 'CLAIMED_DONE', claimedById: 'lead' })]
  const digests = buildDigests(input('2026-11-12T04:00:00Z', { kpis, lateMonths: ['2026-09'] }))
  assert.deepEqual(kinds(digests, 'hr'), ['VERIFY_QUEUE', 'OVERDUE', 'OVERDUE'])
  assert.match(digests.get('hr')?.[2].text ?? '', /September 2026/)
  assert.deepEqual(kinds(digests, 'verifier'), ['VERIFY_QUEUE'])
})

test('a reply reminder repeats daily until the response deadline, so a missed or failed run loses nothing', () => {
  const asked = [kpi('a', { status: 'NEEDS_INFO', claimedById: 'lead', decidedAt: new Date('2026-11-05T10:00:00Z') })]
  assert.deepEqual(kinds(buildDigests(input('2026-11-09T04:00:00Z', { kpis: asked })), 'lead'), ['RESPONSE_NEEDED'])
  assert.match(buildDigests(input('2026-11-09T04:00:00Z', { kpis: asked })).get('lead')?.[0].text ?? '', /13 Nov/)
  assert.deepEqual(kinds(buildDigests(input('2026-11-14T04:00:00Z', { kpis: asked })), 'lead'), [])
})

import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { changeRequestsFor, decideChange, requestChange } from '../lib/kpi/service/changes'
import { KpiError } from '../lib/kpi/service/errors'
import { createGoal, createKpi } from '../lib/kpi/service/goals'
import { myView } from '../lib/kpi/service/views'
import { actorFor, DB_TEST, KPI_DB_READY, PEOPLE, resetKpiTestData, seedKpiPeople } from './helpers/kpi-test-db'

const beforeLock = new Date('2026-10-02T08:00:00Z')
const afterLock = new Date('2026-10-20T08:00:00Z')
const lead = actorFor(PEOPLE.lead)
const verifier = actorFor(PEOPLE.verifier, ['VERIFIER'])
const isStatus = (status: number) => (e: unknown) => e instanceof KpiError && e.status === status

beforeEach(async () => {
  if (!KPI_DB_READY) return
  await resetKpiTestData(prisma)
  await seedKpiPeople(prisma)
})
after(async () => {
  await prisma.$disconnect()
})

async function lockedKpi() {
  const goal = await createGoal(lead, { monthKey: '2026-10', scope: 'TEAM', title: 'Grow pipeline' }, beforeLock)
  return createKpi(lead, { goalId: goal.id, title: 'Outreach', target: '40 emails', evidenceType: 'LINK', ownerIds: [PEOPLE.member.id] }, beforeLock)
}

test('a lead asks to change a locked KPI; only one request can wait at a time', DB_TEST, async () => {
  const kpi = await lockedKpi()
  const request = await requestChange(lead, kpi.id, { version: 0, proposed: { target: '30 emails' }, reason: 'Client cut the list' }, afterLock)
  assert.equal(request.status, 'PENDING')
  await assert.rejects(requestChange(lead, kpi.id, { version: 1, proposed: { cancel: true }, reason: 'Actually cancel' }, afterLock), isStatus(409))
})

test('drafts and owners cannot use change requests', DB_TEST, async () => {
  const kpi = await lockedKpi()
  await assert.rejects(requestChange(lead, kpi.id, { version: 0, proposed: { target: '30 emails' }, reason: 'Too early' }, beforeLock), isStatus(409))
  await assert.rejects(requestChange(actorFor(PEOPLE.member), kpi.id, { version: 0, proposed: { target: '30 emails' }, reason: 'Owner asks' }, afterLock), isStatus(403))
})

test('an approved edit changes the KPI and keeps the locked snapshot for comparison', DB_TEST, async () => {
  const kpi = await lockedKpi()
  const request = await requestChange(lead, kpi.id, { version: 0, proposed: { target: '30 emails' }, reason: 'Client cut the list' }, afterLock)
  await decideChange(verifier, request.id, { approve: true, note: 'Confirmed with the client' }, afterLock)
  const stored = await prisma.kpi.findUniqueOrThrow({ where: { id: kpi.id } })
  assert.equal(stored.target, '30 emails')
  assert.equal(stored.status, 'LOCKED')
  assert.equal((stored.lockedSnapshot as { target: string }).target, '40 emails')
  const event = await prisma.kpiEvent.findFirstOrThrow({ where: { kpiId: kpi.id, action: 'CHANGE_APPROVED' } })
  assert.equal((event.before as { target: string }).target, '40 emails')
  assert.equal((event.after as { target: string }).target, '30 emails')
  assert.equal((await prisma.kpiChangeRequest.findUniqueOrThrow({ where: { id: request.id } })).status, 'APPROVED')
})

test('requesters, owners and setters cannot decide', DB_TEST, async () => {
  const kpi = await lockedKpi()
  const request = await requestChange(lead, kpi.id, { version: 0, proposed: { cancel: true }, reason: 'Client cancelled' }, afterLock)
  await assert.rejects(decideChange(actorFor(PEOPLE.lead, ['VERIFIER']), request.id, { approve: true, note: 'Self approve' }, afterLock), isStatus(403))
  await assert.rejects(decideChange(actorFor(PEOPLE.member), request.id, { approve: true, note: 'Owner approve' }, afterLock), isStatus(403))
})

test('an approved cancellation takes the KPI out of KPI %', DB_TEST, async () => {
  const kpi = await lockedKpi()
  const request = await requestChange(lead, kpi.id, { version: 0, proposed: { cancel: true }, reason: 'Client cancelled' }, afterLock)
  await decideChange(verifier, request.id, { approve: true, note: 'Client email seen' }, afterLock)
  assert.equal((await prisma.kpi.findUniqueOrThrow({ where: { id: kpi.id } })).status, 'CANCELLED')
  const mine = await myView(actorFor(PEOPLE.member), '2026-Q4', afterLock)
  assert.equal(mine.percent.counted, 0)
  assert.equal(mine.kpis[0].status, 'CANCELLED')
})

test('a rejected request leaves the KPI as it was', DB_TEST, async () => {
  const kpi = await lockedKpi()
  const request = await requestChange(lead, kpi.id, { version: 0, proposed: { target: '10 emails' }, reason: 'Too hard' }, afterLock)
  await decideChange(verifier, request.id, { approve: false, note: 'Target was agreed with the client' }, afterLock)
  assert.equal((await prisma.kpi.findUniqueOrThrow({ where: { id: kpi.id } })).target, '40 emails')
  assert.equal((await prisma.kpiChangeRequest.findUniqueOrThrow({ where: { id: request.id } })).status, 'REJECTED')
  assert.equal(await prisma.kpiEvent.count({ where: { kpiId: kpi.id, action: 'CHANGE_REJECTED' } }), 1)
})

test('a proposal cannot add owners from outside the team', DB_TEST, async () => {
  const kpi = await lockedKpi()
  await assert.rejects(
    requestChange(lead, kpi.id, { version: 0, proposed: { ownerIds: [PEOPLE.member.id, PEOPLE.orphan.id] }, reason: 'Add help' }, afterLock),
    /team/,
  )
})

test('pending requests are listed for deciders only', DB_TEST, async () => {
  const kpi = await lockedKpi()
  await requestChange(lead, kpi.id, { version: 0, proposed: { target: '30 emails' }, reason: 'Client cut the list' }, afterLock)
  const list = await changeRequestsFor(verifier)
  assert.equal(list.length, 1)
  assert.equal(list[0].canDecide, true)
  assert.equal(list[0].kpiTitle, 'Outreach')
  await assert.rejects(changeRequestsFor(actorFor(PEOPLE.member)), isStatus(403))
})

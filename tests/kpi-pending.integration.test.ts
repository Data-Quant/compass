import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { requestChange } from '../lib/kpi/service/changes'
import { claimKpi } from '../lib/kpi/service/claims'
import { createGoal, createKpi } from '../lib/kpi/service/goals'
import { pendingCount } from '../lib/kpi/service/pending'
import { decideKpi } from '../lib/kpi/service/verification'
import { actorFor, DB_TEST, KPI_DB_READY, PEOPLE, resetKpiTestData, seedKpiPeople } from './helpers/kpi-test-db'

const beforeLock = new Date('2026-10-02T08:00:00Z')
const afterLock = new Date('2026-10-20T08:00:00Z')
const lead = actorFor(PEOPLE.lead)
const hr = actorFor(PEOPLE.hr)
const verifier = actorFor(PEOPLE.verifier, ['VERIFIER'])

beforeEach(async () => {
  if (!KPI_DB_READY) return
  await resetKpiTestData(prisma)
  await seedKpiPeople(prisma)
})
after(async () => {
  await prisma.$disconnect()
})

async function teamKpi() {
  const goal = await createGoal(lead, { monthKey: '2026-10', scope: 'TEAM', title: 'Grow pipeline' }, beforeLock)
  return createKpi(lead, { goalId: goal.id, title: 'Outreach', target: '40 emails', evidenceType: 'LINK', ownerIds: [PEOPLE.member.id] }, beforeLock)
}

test('a KPI to claim counts for its claimer once it locks, not for its owner or HR', DB_TEST, async () => {
  await teamKpi()
  assert.equal(await pendingCount(lead, beforeLock), 0)
  assert.equal(await pendingCount(lead, afterLock), 1)
  assert.equal(await pendingCount(actorFor(PEOPLE.member), afterLock), 0)
  assert.equal(await pendingCount(hr, afterLock), 0)
})

test('a claim moves to the verifiers, and back to the claimer when Execution asks for more', DB_TEST, async () => {
  const kpi = await teamKpi()
  const claim = await claimKpi(lead, kpi.id, { version: 0, outcome: 'DONE', url: 'https://x.example/proof' }, afterLock)
  assert.equal(await pendingCount(lead, afterLock), 0)
  assert.equal(await pendingCount(verifier, afterLock), 1)
  assert.equal(await pendingCount(hr, afterLock), 1)
  assert.equal(await pendingCount(actorFor(PEOPLE.lead, ['VERIFIER']), afterLock), 0)
  await decideKpi(verifier, kpi.id, { version: claim.version, decision: 'NEEDS_INFO', note: 'Which report?' }, afterLock)
  assert.equal(await pendingCount(lead, afterLock), 1)
  assert.equal(await pendingCount(verifier, afterLock), 0)
})

test('a waiting change request counts for people who may decide it, not the requester', DB_TEST, async () => {
  const kpi = await teamKpi()
  await requestChange(lead, kpi.id, { version: 0, proposed: { cancel: true }, reason: 'Client cancelled' }, afterLock)
  assert.equal(await pendingCount(actorFor(PEOPLE.exec), afterLock), 1)
  assert.equal(await pendingCount(verifier, afterLock), 1)
  // The lead still has the claim itself to make, but is never asked to decide their own request.
  assert.equal(await pendingCount(actorFor(PEOPLE.lead, ['VERIFIER']), afterLock), 1)
})

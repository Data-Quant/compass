import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { claimKpi } from '../lib/kpi/service/claims'
import { kpiDetail } from '../lib/kpi/service/detail'
import { KpiError } from '../lib/kpi/service/errors'
import { createGoal, createKpi } from '../lib/kpi/service/goals'
import { decideKpi } from '../lib/kpi/service/verification'
import { myView, teamView } from '../lib/kpi/service/views'
import { actorFor, DB_TEST, KPI_DB_READY, PEOPLE, resetKpiTestData, seedKpiPeople } from './helpers/kpi-test-db'

const beforeLock = new Date('2026-10-02T08:00:00Z')
const afterLock = new Date('2026-10-20T08:00:00Z')
const lead = actorFor(PEOPLE.lead)
const member = actorFor(PEOPLE.member)
const verifier = actorFor(PEOPLE.verifier, ['VERIFIER'])
const NO_ACTIONS = { claim: false, respond: false, appeal: false, uploadEvidence: false, requestChange: false }

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

test('the team view offers the lead a claim after the lock; the owner gets no actions', DB_TEST, async () => {
  await teamKpi()
  const leadView = await teamView(lead, '2026-10', null, afterLock)
  assert.equal(leadView.goals[0].kpis[0].status, 'LOCKED')
  assert.equal(leadView.goals[0].kpis[0].actions.claim, true)
  assert.equal(leadView.goals[0].kpis[0].actions.requestChange, true)
  const mine = await myView(member, '2026-Q4', afterLock)
  assert.deepEqual(mine.kpis[0].actions, NO_ACTIONS)
})

test('views show the claim link and the Execution note', DB_TEST, async () => {
  const kpi = await teamKpi()
  const claim = await claimKpi(lead, kpi.id, { version: 0, outcome: 'DONE', url: 'https://x.example/proof', note: 'Sent 41' }, afterLock)
  await decideKpi(verifier, kpi.id, { version: claim.version, decision: 'NEEDS_INFO', note: 'Which report?' }, afterLock)
  const mine = await myView(member, '2026-Q4', afterLock)
  assert.equal(mine.kpis[0].status, 'NEEDS_INFO')
  assert.equal(mine.kpis[0].claim?.url, 'https://x.example/proof')
  assert.equal(mine.kpis[0].claim?.claimedBy.id, PEOPLE.lead.id)
  assert.equal(mine.kpis[0].decision?.note, 'Which report?')
  const leadView = await teamView(lead, '2026-10', null, afterLock)
  assert.equal(leadView.goals[0].kpis[0].actions.respond, true)
})

test('KPI detail gives verifiers history, snapshot and claimer stats; owners see less; others nothing', DB_TEST, async () => {
  const kpi = await teamKpi()
  await claimKpi(lead, kpi.id, { version: 0, outcome: 'DONE', url: 'https://x.example/proof' }, afterLock)
  const forVerifier = await kpiDetail(verifier, kpi.id, afterLock)
  assert.equal(forVerifier.lockedSnapshot?.target, '40 emails')
  assert.deepEqual(forVerifier.history.map((row) => row.action), ['KPI_CREATE', 'GOALS_LOCK', 'CLAIM'])
  assert.equal(forVerifier.canDecide, true)
  assert.deepEqual(forVerifier.claimerStats, { claims: 1, rejections: 0 })
  const forOwner = await kpiDetail(member, kpi.id, afterLock)
  assert.deepEqual(forOwner.history, [])
  assert.equal(forOwner.claimerStats, null)
  assert.equal(forOwner.canDecide, false)
  await assert.rejects(kpiDetail(actorFor(PEOPLE.orphan), kpi.id, afterLock), (e: unknown) => e instanceof KpiError && e.status === 404)
})

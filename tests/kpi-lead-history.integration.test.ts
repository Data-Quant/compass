import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { claimKpi, respondToKpi } from '../lib/kpi/service/claims'
import { KpiError } from '../lib/kpi/service/errors'
import { createGoal, createKpi } from '../lib/kpi/service/goals'
import { leadClaimHistory } from '../lib/kpi/service/lead-history'
import { decideKpi, verificationQueue } from '../lib/kpi/service/verification'
import { actorFor, DB_TEST, KPI_DB_READY, PEOPLE, resetKpiTestData, seedKpiPeople } from './helpers/kpi-test-db'

const beforeLock = new Date('2026-10-02T08:00:00Z')
const afterLock = new Date('2026-10-20T08:00:00Z')
const laterAfterLock = new Date('2026-10-21T08:00:00Z')
const OCTOBER = { fromMonth: '2026-10', toMonth: '2026-10' }
const lead = actorFor(PEOPLE.lead)
const hr = actorFor(PEOPLE.hr)
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

test('each lead’s KPIs are counted from their status and history over the chosen months', DB_TEST, async () => {
  const goal = await createGoal(lead, { monthKey: '2026-10', scope: 'TEAM', title: 'October outreach' }, beforeLock)
  const kpis = []
  for (const title of ['Verified', 'Appealed', 'Asked first', 'Not done', 'Silent']) {
    kpis.push(await createKpi(lead, { goalId: goal.id, title, target: '40 emails', evidenceType: 'LINK', ownerIds: [PEOPLE.member.id] }, beforeLock))
  }
  const [verified, appealed, asked, notDone] = kpis
  const claimDone = (id: string) => claimKpi(lead, id, { version: 0, outcome: 'DONE', url: 'https://x.example/proof' }, afterLock)
  const v = await claimDone(verified.id)
  await decideKpi(verifier, verified.id, { version: v.version, decision: 'VERIFIED' }, afterLock)
  const a1 = await claimDone(appealed.id)
  const a2 = await decideKpi(verifier, appealed.id, { version: a1.version, decision: 'REJECTED', note: 'No proof attached' }, afterLock)
  const a3 = await respondToKpi(lead, appealed.id, { version: a2.version, kind: 'APPEAL', note: 'Page 2 has it' }, afterLock)
  await decideKpi(verifier, appealed.id, { version: a3.version, decision: 'NOT_VERIFIED', note: 'Page 2 is blank' }, afterLock)
  const q1 = await claimDone(asked.id)
  const q2 = await decideKpi(verifier, asked.id, { version: q1.version, decision: 'NEEDS_INFO', note: 'Which report?' }, afterLock)
  const q3 = await respondToKpi(lead, asked.id, { version: q2.version, kind: 'REPLY', note: 'The October summary' }, afterLock)
  await decideKpi(verifier, asked.id, { version: q3.version, decision: 'REJECTED', note: 'Still incomplete' }, afterLock)
  await claimKpi(lead, notDone.id, { version: 0, outcome: 'NOT_DONE' }, afterLock)

  const view = await leadClaimHistory(hr, OCTOBER, laterAfterLock)
  const row = view.rows.find((r) => r.lead.id === PEOPLE.lead.id)!
  assert.deepEqual(
    [row.locked, row.claimedDone, row.claimedNotDone, row.verified, row.needsInfo, row.rejectedAtFirstDecision, row.decided, row.appealed, row.finallyNotVerified],
    [5, 3, 1, 1, 1, 1, 3, 1, 1],
  )
  assert.deepEqual([row.claimRate, row.rejectionRate, row.flagged], [0.6, 1 / 3, false])
  assert.deepEqual([view.fromMonth, view.toMonth], ['2026-10', '2026-10'])
  assert.deepEqual((await leadClaimHistory(hr, { fromMonth: '2026-11', toMonth: '2026-12' }, laterAfterLock)).rows, [])
})

test('a lead with a quarter of four decided claims rejected is flagged, the queue shows each lead’s rate, and only verifiers and HR see it', DB_TEST, async () => {
  const partner = actorFor(PEOPLE.partner)
  const exec = actorFor(PEOPLE.exec)
  const goal = await createGoal(partner, { monthKey: '2026-10', scope: 'DEPARTMENT', departmentKey: 'value creation', title: 'Portfolio reviews' }, beforeLock)
  const kpis = []
  for (const title of ['Review A', 'Review B', 'Review C', 'Review D', 'Review E']) {
    kpis.push(await createKpi(partner, { goalId: goal.id, title, target: '6 reviews', evidenceType: 'NUMBER', ownerIds: [PEOPLE.exec.id] }, beforeLock))
  }
  const claims = []
  for (const kpi of kpis) claims.push(await claimKpi(exec, kpi.id, { version: 0, outcome: 'DONE', reportedValue: '6' }, afterLock))
  for (const [index, decision] of (['REJECTED', 'VERIFIED', 'VERIFIED', 'VERIFIED'] as const).entries()) {
    await decideKpi(verifier, kpis[index].id, { version: claims[index].version, decision, ...(decision === 'REJECTED' ? { note: 'Only four reviews' } : {}) }, afterLock)
  }
  const view = await leadClaimHistory(exec, OCTOBER, laterAfterLock)
  assert.equal(view.rows[0].lead.id, PEOPLE.partner.id)
  assert.deepEqual([view.rows[0].decided, view.rows[0].rejectionRate, view.rows[0].flagged], [4, 0.25, true])
  const waiting = (await verificationQueue(verifier, laterAfterLock)).items.find((item) => item.kpiId === kpis[4].id)!
  assert.deepEqual(waiting.setterHistory, { rejectionRate: 0.25, decided: 4, flagged: true })
  await assert.rejects(leadClaimHistory(actorFor(PEOPLE.member), OCTOBER, laterAfterLock), isStatus(403))
  await assert.rejects(leadClaimHistory(hr, { fromMonth: '2026-10', toMonth: '2026-09' }, laterAfterLock), isStatus(400))
  await assert.rejects(leadClaimHistory(hr, { fromMonth: '2025-01', toMonth: '2026-10' }, laterAfterLock), isStatus(400))
  await assert.rejects(leadClaimHistory(hr, { fromMonth: 'October', toMonth: '2026-10' }, laterAfterLock), isStatus(400))
})

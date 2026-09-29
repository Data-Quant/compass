import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { claimKpi, respondToKpi } from '../lib/kpi/service/claims'
import { KpiError } from '../lib/kpi/service/errors'
import { markMonthFinal, overrideResult, refreshMonthFinalization, reopenMonth } from '../lib/kpi/service/finalization'
import { createGoal, createKpi } from '../lib/kpi/service/goals'
import { claimerStats, decideKpi, verificationQueue } from '../lib/kpi/service/verification'
import { actorFor, DB_TEST, KPI_DB_READY, PEOPLE, resetKpiTestData, seedKpiPeople } from './helpers/kpi-test-db'

const beforeLock = new Date('2026-10-02T08:00:00Z')
const afterLock = new Date('2026-10-20T08:00:00Z')
const laterAfterLock = new Date('2026-10-21T08:00:00Z')
const afterClaims = new Date('2026-11-06T08:00:00Z')
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

async function claimedTeamKpi(title = 'Outreach', claimedAt = afterLock) {
  const goal = await createGoal(lead, { monthKey: '2026-10', scope: 'TEAM', title: `Goal for ${title}` }, beforeLock)
  const kpi = await createKpi(lead, { goalId: goal.id, title, target: '40 emails', evidenceType: 'LINK', ownerIds: [PEOPLE.member.id] }, beforeLock)
  const claim = await claimKpi(lead, kpi.id, { version: 0, outcome: 'DONE', url: 'https://x.example/proof' }, claimedAt)
  return { id: kpi.id, version: claim.version, monthId: goal.kpiMonthId }
}

test('a verifier verifies a claim and the audit records the verifier role', DB_TEST, async () => {
  const kpi = await claimedTeamKpi()
  const result = await decideKpi(verifier, kpi.id, { version: kpi.version, decision: 'VERIFIED' }, afterLock)
  assert.equal(result.status, 'VERIFIED')
  assert.equal((await prisma.kpiEvent.findFirstOrThrow({ where: { kpiId: kpi.id, action: 'DECIDE' } })).actorRole, 'VERIFIER')
  assert.equal((await prisma.kpi.findUniqueOrThrow({ where: { id: kpi.id } })).decidedById, PEOPLE.verifier.id)
})

test('non-verifiers and verifiers with a conflict are refused', DB_TEST, async () => {
  const kpi = await claimedTeamKpi()
  await assert.rejects(decideKpi(actorFor(PEOPLE.member), kpi.id, { version: kpi.version, decision: 'VERIFIED' }, afterLock), isStatus(403))
  await assert.rejects(decideKpi(actorFor(PEOPLE.lead, ['VERIFIER']), kpi.id, { version: kpi.version, decision: 'VERIFIED' }, afterLock), isStatus(403))
  const partner = actorFor(PEOPLE.partner)
  const goal = await createGoal(partner, { monthKey: '2026-10', scope: 'DEPARTMENT', departmentKey: 'value creation', title: 'Portfolio reviews' }, beforeLock)
  const deptKpi = await createKpi(partner, { goalId: goal.id, title: 'Quarterly reviews', target: '6 reviews', evidenceType: 'NUMBER', ownerIds: [PEOPLE.exec.id] }, beforeLock)
  const claim = await claimKpi(actorFor(PEOPLE.exec), deptKpi.id, { version: 0, outcome: 'DONE', reportedValue: '6' }, afterLock)
  await assert.rejects(decideKpi(actorFor(PEOPLE.exec), deptKpi.id, { version: claim.version, decision: 'VERIFIED' }, afterLock), isStatus(403))
  assert.equal((await decideKpi(verifier, deptKpi.id, { version: claim.version, decision: 'VERIFIED' }, afterLock)).status, 'VERIFIED')
})

test('needs info and rejections need a note, and an appeal gets a final decision', DB_TEST, async () => {
  const kpi = await claimedTeamKpi()
  await assert.rejects(decideKpi(verifier, kpi.id, { version: kpi.version, decision: 'NEEDS_INFO' }, afterLock), /note/)
  const asked = await decideKpi(verifier, kpi.id, { version: kpi.version, decision: 'NEEDS_INFO', note: 'Which report?' }, afterLock)
  const replied = await respondToKpi(lead, kpi.id, { version: asked.version, kind: 'REPLY', note: 'The October summary' }, afterLock)
  const rejected = await decideKpi(verifier, kpi.id, { version: replied.version, decision: 'REJECTED', note: 'Summary is incomplete' }, afterLock)
  const appealed = await respondToKpi(lead, kpi.id, { version: rejected.version, kind: 'APPEAL', note: 'Pages 3-4 have the rest' }, afterLock)
  assert.equal(appealed.status, 'APPEALED')
  await assert.rejects(decideKpi(verifier, kpi.id, { version: appealed.version, decision: 'REJECTED', note: 'Still no' }, afterLock), /Verified or Not verified/)
  const final = await decideKpi(verifier, kpi.id, { version: appealed.version, decision: 'NOT_VERIFIED', note: 'Pages 3-4 are blank' }, afterLock)
  assert.equal(final.status, 'NOT_VERIFIED')
})

test('the queue lists open claims oldest first and flags conflicts', DB_TEST, async () => {
  const first = await claimedTeamKpi('Outreach', afterLock)
  const second = await claimedTeamKpi('Demos', laterAfterLock)
  const queue = await verificationQueue(verifier, laterAfterLock)
  assert.deepEqual(queue.items.map((item) => item.kpiId), [first.id, second.id])
  assert.ok(queue.items.every((item) => item.canDecide))
  const leadQueue = await verificationQueue(actorFor(PEOPLE.lead, ['VERIFIER']), laterAfterLock)
  assert.ok(leadQueue.items.every((item) => !item.canDecide))
  await assert.rejects(verificationQueue(actorFor(PEOPLE.member), laterAfterLock), isStatus(403))
})

test('claimer stats count done claims and rejections', DB_TEST, async () => {
  const kpi = await claimedTeamKpi()
  await decideKpi(verifier, kpi.id, { version: kpi.version, decision: 'REJECTED', note: 'No proof' }, afterLock)
  assert.deepEqual((await claimerStats([PEOPLE.lead.id])).get(PEOPLE.lead.id), { claims: 1, rejections: 1 })
})

test('a month becomes final once claims close and every KPI has a result', DB_TEST, async () => {
  const kpi = await claimedTeamKpi()
  await decideKpi(verifier, kpi.id, { version: kpi.version, decision: 'VERIFIED' }, afterLock)
  assert.equal(await refreshMonthFinalization(kpi.monthId, afterLock), false)
  assert.equal(await refreshMonthFinalization(kpi.monthId, afterClaims), true)
  assert.ok((await prisma.kpiMonth.findUniqueOrThrow({ where: { id: kpi.monthId } })).finalizedAt)
})

test('deciding the last open KPI after claims close finalizes the month', DB_TEST, async () => {
  const kpi = await claimedTeamKpi()
  await decideKpi(verifier, kpi.id, { version: kpi.version, decision: 'VERIFIED' }, afterClaims)
  assert.ok((await prisma.kpiMonth.findUniqueOrThrow({ where: { id: kpi.monthId } })).finalizedAt)
})

test('HR corrects a result only after reopening, then finalizes by hand', DB_TEST, async () => {
  const kpi = await claimedTeamKpi()
  const decided = await decideKpi(verifier, kpi.id, { version: kpi.version, decision: 'VERIFIED' }, afterClaims)
  await assert.rejects(overrideResult(hr, kpi.id, { version: decided.version, to: 'NOT_VERIFIED', reason: 'Proof was for September' }, afterClaims), /Reopen/)
  await assert.rejects(reopenMonth(lead, kpi.monthId, 'Nope', afterClaims), isStatus(403))
  await reopenMonth(hr, kpi.monthId, 'Late correction', afterClaims)
  const corrected = await overrideResult(hr, kpi.id, { version: decided.version, to: 'NOT_VERIFIED', reason: 'Proof was for September' }, afterClaims)
  assert.equal(corrected.status, 'NOT_VERIFIED')
  assert.equal(await refreshMonthFinalization(kpi.monthId, afterClaims), false)
  await markMonthFinal(hr, kpi.monthId, afterClaims)
  assert.ok((await prisma.kpiMonth.findUniqueOrThrow({ where: { id: kpi.monthId } })).finalizedAt)
  const monthEvents = await prisma.kpiEvent.findMany({ where: { kpiMonthId: kpi.monthId, action: { in: ['MONTH_FINAL', 'MONTH_REOPEN'] } } })
  assert.deepEqual(monthEvents.map((e) => e.action).sort(), ['MONTH_FINAL', 'MONTH_FINAL', 'MONTH_REOPEN'])
})

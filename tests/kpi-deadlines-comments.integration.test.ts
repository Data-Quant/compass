import test, { after, afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { alertVerifiersOfClaim } from '../lib/kpi/service/claim-alerts'
import { claimKpi } from '../lib/kpi/service/claims'
import { addKpiComment, listKpiComments } from '../lib/kpi/service/comments'
import { KpiError } from '../lib/kpi/service/errors'
import { createGoal, createKpi, updateKpi } from '../lib/kpi/service/goals'
import { teamView, verifierView } from '../lib/kpi/service/views'
import { actorFor, DB_TEST, KPI_DB_READY, PEOPLE, resetKpiTestData, seedKpiPeople } from './helpers/kpi-test-db'

const beforeLock = new Date('2026-10-02T08:00:00Z')
const afterLock = new Date('2026-10-20T08:00:00Z')
const lead = actorFor(PEOPLE.lead)
const exec = actorFor(PEOPLE.exec)
const isStatus = (status: number) => (e: unknown) => e instanceof KpiError && e.status === status
function mailbox() {
  const sent: Array<{ to: string; subject: string; html: string }> = []
  return { sent, send: async (to: string, subject: string, html: string) => { sent.push({ to, subject, html }) } }
}

beforeEach(async () => {
  if (!KPI_DB_READY) return
  await resetKpiTestData(prisma)
  await seedKpiPeople(prisma)
})
afterEach(() => {
  delete process.env.KPI_SEND_EMAILS
})
after(async () => {
  await prisma.$disconnect()
})

async function teamKpi(dueDate?: string) {
  const goal = await createGoal(lead, { monthKey: '2026-10', scope: 'TEAM', title: 'Grow pipeline' }, beforeLock)
  return createKpi(lead, { goalId: goal.id, title: 'Outreach', target: '40 emails', evidenceType: 'LINK', ownerIds: [PEOPLE.member.id], ...(dueDate ? { dueDate } : {}) }, beforeLock)
}

test('each KPI has its own deadline, and a completion after it shows as late', DB_TEST, async () => {
  const kpi = await teamKpi('2026-10-15')
  await assert.rejects(teamKpi('2026-11-03'), /October 2026/)
  const edited = await updateKpi(lead, kpi.id, { action: 'edit', version: 0, dueDate: '2026-10-16' }, beforeLock)
  await claimKpi(lead, kpi.id, { version: edited.version, outcome: 'DONE', url: 'https://drive.example/r' }, afterLock)
  const [row] = (await teamView(lead, '2026-10', null, afterLock)).goals[0].kpis
  assert.deepEqual([row.dueDate, row.completedAt, row.late], ['2026-10-16', '2026-10-20', true])
  const [seen] = (await verifierView(exec, '2026-10', afterLock)).goals[0].kpis
  assert.equal(seen.dueDate, '2026-10-16')
})

test('Execution, the lead and owners share a comment thread; others cannot see it', DB_TEST, async () => {
  const kpi = await teamKpi()
  await addKpiComment(exec, kpi.id, { body: 'Please attach the tracker link.' }, afterLock)
  await addKpiComment(actorFor(PEOPLE.member), kpi.id, { body: 'Added it to the claim.' }, afterLock)
  const thread = await listKpiComments(lead, kpi.id)
  assert.deepEqual(thread.map((c) => [c.author.name, c.body]), [['Test Execution', 'Please attach the tracker link.'], ['Test Member', 'Added it to the claim.']])
  await assert.rejects(addKpiComment(actorFor(PEOPLE.orphan), kpi.id, { body: 'Hello' }, afterLock), isStatus(404))
  await assert.rejects(listKpiComments(actorFor(PEOPLE.orphan), kpi.id), isStatus(404))
  const [row] = (await teamView(lead, '2026-10', null, afterLock)).goals[0].kpis
  assert.equal(row.commentCount, 2)
})

test('a done claim emails Execution at once, never the claimer, once per claim, and only when emails are on', DB_TEST, async () => {
  await prisma.kpiRoleGrant.create({ data: { userId: PEOPLE.verifier.id, role: 'VERIFIER', createdById: PEOPLE.hr.id } })
  const kpi = await teamKpi()
  await claimKpi(lead, kpi.id, { version: 0, outcome: 'DONE', url: 'https://drive.example/r' }, afterLock)
  const off = mailbox()
  assert.equal((await alertVerifiersOfClaim(kpi.id, off.send, 'https://compass.example')).sent, 0)
  assert.equal(off.sent.length, 0)
  process.env.KPI_SEND_EMAILS = 'true'
  const on = mailbox()
  await alertVerifiersOfClaim(kpi.id, on.send, 'https://compass.example')
  assert.deepEqual(on.sent.map((m) => m.to).sort(), ['kpit-exec@example.test', 'kpit-verifier@example.test'])
  assert.match(on.sent[0].subject, /Outreach/)
  assert.match(on.sent[0].html, /kpis\/verify/)
  const again = mailbox()
  await alertVerifiersOfClaim(kpi.id, again.send, 'https://compass.example')
  assert.equal(again.sent.length, 0)
})

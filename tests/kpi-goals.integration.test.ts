import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { KpiError } from '../lib/kpi/service/errors'
import { createGoal, createKpi, updateGoal, updateKpi } from '../lib/kpi/service/goals'
import { actorFor, DB_TEST, KPI_DB_READY, PEOPLE, resetKpiTestData, seedKpiPeople } from './helpers/kpi-test-db'

const beforeLock = new Date('2026-10-02T08:00:00Z')
const afterLock = new Date('2026-10-20T08:00:00Z')
const lead = actorFor(PEOPLE.lead)
const isStatus = (status: number) => (e: unknown) => e instanceof KpiError && e.status === status

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
  const kpi = await createKpi(lead, { goalId: goal.id, title: 'Outreach', target: '40 emails', evidenceType: 'NUMBER', ownerIds: [PEOPLE.member.id] }, beforeLock)
  return { goal, kpi }
}

test('a lead creates a team goal and KPI for their report, with audit events', DB_TEST, async () => {
  const { kpi } = await teamKpi()
  assert.equal(kpi.status, 'DRAFT')
  const events = await prisma.kpiEvent.findMany()
  assert.deepEqual(events.map((e) => e.action).sort(), ['GOAL_CREATE', 'KPI_CREATE'])
})

test('owners outside the team and non-setters are refused', DB_TEST, async () => {
  const goal = await createGoal(lead, { monthKey: '2026-10', scope: 'TEAM', title: 'Grow pipeline' }, beforeLock)
  await assert.rejects(
    createKpi(lead, { goalId: goal.id, title: 'Outreach', target: '40 emails', evidenceType: 'NUMBER', ownerIds: [PEOPLE.orphan.id] }, beforeLock),
    /team/,
  )
  await assert.rejects(createGoal(actorFor(PEOPLE.orphan), { monthKey: '2026-10', scope: 'TEAM', title: 'Mine' }, beforeLock), isStatus(403))
  await assert.rejects(createGoal(actorFor(PEOPLE.hr), { monthKey: '2026-10', scope: 'TEAM', setterId: PEOPLE.orphan.id, title: 'X goal' }, beforeLock), isStatus(403))
  const onBehalf = await createGoal(actorFor(PEOPLE.hr), { monthKey: '2026-10', scope: 'TEAM', setterId: PEOPLE.lead.id, title: 'HR set' }, beforeLock)
  assert.equal(onBehalf.setterId, PEOPLE.lead.id)
})

test('Partners set department KPIs owned only by that department’s leads/JPs', DB_TEST, async () => {
  const partner = actorFor(PEOPLE.partner)
  const goal = await createGoal(partner, { monthKey: '2026-10', scope: 'DEPARTMENT', departmentKey: 'Product ', title: 'Ship roadmap' }, beforeLock)
  assert.equal(goal.departmentKey, 'product')
  const kpi = await createKpi(partner, { goalId: goal.id, title: 'Release v2', target: 'Live for all clients', evidenceType: 'LINK', ownerIds: [PEOPLE.lead.id, PEOPLE.jp.id] }, beforeLock)
  assert.equal(kpi.status, 'DRAFT')
  await assert.rejects(
    createKpi(partner, { goalId: goal.id, title: 'Bad owner', target: 'x x x', evidenceType: 'LINK', ownerIds: [PEOPLE.member.id] }, beforeLock),
    /leads or JPs/,
  )
  await assert.rejects(createGoal(actorFor(PEOPLE.jp), { monthKey: '2026-10', scope: 'DEPARTMENT', departmentKey: 'product', title: 'JP goal' }, beforeLock), isStatus(403))
  await assert.rejects(createGoal(partner, { monthKey: '2026-10', scope: 'DEPARTMENT', departmentKey: 'design', title: 'Nobody' }, beforeLock), /no leads or JPs/)
})

test('edits need the current version, replace owners, and log before/after', DB_TEST, async () => {
  const { kpi } = await teamKpi()
  await assert.rejects(updateKpi(lead, kpi.id, { action: 'edit', version: 5, title: 'Stale' }, beforeLock), isStatus(409))
  const updated = await updateKpi(lead, kpi.id, { action: 'edit', version: 0, title: 'Qualified outreach', target: '45 emails' }, beforeLock)
  assert.deepEqual(updated, { id: kpi.id, status: 'DRAFT', version: 1 })
  const event = await prisma.kpiEvent.findFirstOrThrow({ where: { kpiId: kpi.id, action: 'KPI_EDIT' } })
  assert.equal((event.before as { title: string }).title, 'Outreach')
  assert.equal((event.after as { target: string }).target, '45 emails')
})

test('an owner who left the team does not block editing other fields', DB_TEST, async () => {
  const { kpi } = await teamKpi()
  await prisma.evaluatorMapping.deleteMany({ where: { evaluatorId: PEOPLE.lead.id, evaluateeId: PEOPLE.member.id } })
  const updated = await updateKpi(lead, kpi.id, { action: 'edit', version: 0, title: 'Renamed' }, beforeLock)
  assert.equal(updated.version, 1)
  await assert.rejects(updateKpi(lead, kpi.id, { action: 'edit', version: 1, ownerIds: [PEOPLE.member.id] }, beforeLock), /team/)
})

test('after the lock, edits are refused and the KPI is persisted as LOCKED', DB_TEST, async () => {
  const { kpi } = await teamKpi()
  await assert.rejects(updateKpi(lead, kpi.id, { action: 'edit', version: 0, title: 'Too late' }, afterLock), isStatus(409))
  const stored = await prisma.kpi.findUniqueOrThrow({ where: { id: kpi.id } })
  assert.equal(stored.status, 'LOCKED')
})

test('goals cannot be created once the default lock has passed', DB_TEST, async () => {
  await assert.rejects(createGoal(lead, { monthKey: '2026-10', scope: 'TEAM', title: 'Late goal' }, afterLock), isStatus(409))
})

test('discarding cancels a draft; a goal is archived only when no live KPIs remain', DB_TEST, async () => {
  const { goal, kpi } = await teamKpi()
  await assert.rejects(updateGoal(lead, goal.id, { action: 'archive' }, beforeLock), isStatus(409))
  const discarded = await updateKpi(lead, kpi.id, { action: 'discard', version: 0 }, beforeLock)
  assert.equal(discarded.status, 'CANCELLED')
  await updateGoal(lead, goal.id, { action: 'archive' }, beforeLock)
  const archived = await prisma.kpiGoal.findUniqueOrThrow({ where: { id: goal.id } })
  assert.ok(archived.archivedAt)
  await assert.rejects(updateGoal(lead, goal.id, { action: 'edit', title: 'Again' }, beforeLock), isStatus(404))
})

import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { defaultDeadlines } from '../lib/kpi/calendar'
import { KpiError } from '../lib/kpi/service/errors'
import { createMonth, ensureMonth, resolveMonth, updateMonthDeadlines } from '../lib/kpi/service/months'
import { persistSystemTransitions } from '../lib/kpi/service/system'
import { actorFor, DB_TEST, KPI_DB_READY, PEOPLE, resetKpiTestData, seedKpiPeople } from './helpers/kpi-test-db'

beforeEach(async () => {
  if (!KPI_DB_READY) return
  await resetKpiTestData(prisma)
  await seedKpiPeople(prisma)
})
after(async () => {
  await prisma.$disconnect()
})

async function draftKpi() {
  const month = await ensureMonth({ year: 2026, month: 10 })
  const goal = await prisma.kpiGoal.create({ data: { kpiMonthId: month.id, scope: 'TEAM', setterId: PEOPLE.lead.id, title: 'Grow pipeline' } })
  return prisma.kpi.create({
    data: { goalId: goal.id, title: 'Outreach', target: '40 emails', evidenceType: 'NUMBER', assignees: { create: [{ userId: PEOPLE.member.id }] } },
  })
}

test('resolveMonth returns unsaved defaults; ensureMonth persists them once', DB_TEST, async () => {
  const unsaved = await resolveMonth({ year: 2026, month: 10 })
  assert.equal(unsaved.id, null)
  assert.equal(unsaved.goalsLockAt.toISOString(), defaultDeadlines({ year: 2026, month: 10 }).goalsLockAt.toISOString())
  const first = await ensureMonth({ year: 2026, month: 10 })
  const second = await ensureMonth({ year: 2026, month: 10 })
  assert.equal(first.id, second.id)
})

test('only HR creates months, dates must be ordered, and duplicates are refused', DB_TEST, async () => {
  await assert.rejects(createMonth(actorFor(PEOPLE.lead), { year: 2026, month: 10 }), (e: unknown) => e instanceof KpiError && e.status === 403)
  const defaults = defaultDeadlines({ year: 2026, month: 10 })
  await assert.rejects(createMonth(actorFor(PEOPLE.hr), { year: 2026, month: 10 }, { ...defaults, goalsLockAt: defaults.claimsDueAt }), /lock must come before/)
  const created = await createMonth(actorFor(PEOPLE.hr), { year: 2026, month: 10 })
  assert.equal(created.month, 10)
  await assert.rejects(createMonth(actorFor(PEOPLE.hr), { year: 2026, month: 10 }), (e: unknown) => e instanceof KpiError && e.status === 409)
})

test('editing deadlines records a MONTH_EDIT event with before and after', DB_TEST, async () => {
  const month = await createMonth(actorFor(PEOPLE.hr), { year: 2026, month: 10 })
  const moved = { ...defaultDeadlines({ year: 2026, month: 10 }), goalsLockAt: new Date('2026-10-14T18:59:59.999Z') }
  await updateMonthDeadlines(actorFor(PEOPLE.hr), month.id, moved)
  const saved = await prisma.kpiMonth.findUniqueOrThrow({ where: { id: month.id } })
  assert.equal(saved.goalsLockAt.toISOString(), '2026-10-14T18:59:59.999Z')
  const events = await prisma.kpiEvent.findMany({ where: { kpiMonthId: month.id } })
  assert.deepEqual(events.map((e) => e.action).sort(), ['MONTH_CREATE', 'MONTH_EDIT'])
  const edit = events.find((e) => e.action === 'MONTH_EDIT')
  assert.equal((edit?.before as { goalsLockAt: string }).goalsLockAt, '2026-10-07T18:59:59.999Z')
})

test('drafts lock after the lock date with a snapshot and one SYSTEM event', DB_TEST, async () => {
  const kpi = await draftKpi()
  assert.equal(await persistSystemTransitions({ id: kpi.id }, new Date('2026-10-05T00:00:00Z')), 0)
  assert.equal(await persistSystemTransitions({ id: kpi.id }, new Date('2026-10-20T00:00:00Z')), 1)
  const locked = await prisma.kpi.findUniqueOrThrow({ where: { id: kpi.id } })
  assert.equal(locked.status, 'LOCKED')
  assert.deepEqual(locked.lockedSnapshot, { title: 'Outreach', target: '40 emails', evidenceType: 'NUMBER', assigneeIds: [PEOPLE.member.id] })
  const events = await prisma.kpiEvent.findMany({ where: { kpiId: kpi.id } })
  assert.deepEqual(events.map((e) => [e.action, e.actorRole, e.fromStatus, e.toStatus]), [['GOALS_LOCK', 'SYSTEM', 'DRAFT', 'LOCKED']])
  assert.equal(await persistSystemTransitions({ id: kpi.id }, new Date('2026-10-21T00:00:00Z')), 0)
})

test('an unclaimed draft chains to NOT_DONE after the claims deadline', DB_TEST, async () => {
  const kpi = await draftKpi()
  await persistSystemTransitions({ id: kpi.id }, new Date('2026-11-06T00:00:00Z'))
  const done = await prisma.kpi.findUniqueOrThrow({ where: { id: kpi.id } })
  assert.equal(done.status, 'NOT_DONE')
  const events = await prisma.kpiEvent.findMany({ where: { kpiId: kpi.id } })
  assert.deepEqual(events.map((e) => e.action).sort(), ['CLAIMS_DEADLINE', 'GOALS_LOCK'])
})

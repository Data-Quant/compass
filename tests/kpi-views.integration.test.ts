import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { loadKpiContext } from '../lib/kpi/service/context'
import { KpiError } from '../lib/kpi/service/errors'
import { createGoal, createKpi } from '../lib/kpi/service/goals'
import { capabilitiesOf, departmentView, myView, teamView, verifierView } from '../lib/kpi/service/views'
import { addGrant, addSetterAssignment, grantsOverview, listAdminMonths, quarterOverview, removeSetterAssignment, settersOverview } from '../lib/kpi/service/admin'
import { actorFor, DB_TEST, KPI_DB_READY, PEOPLE, resetKpiTestData, seedKpiPeople } from './helpers/kpi-test-db'

const now = new Date('2026-10-02T08:00:00Z')
const lead = actorFor(PEOPLE.lead)
const hr = actorFor(PEOPLE.hr)
const isStatus = (status: number) => (e: unknown) => e instanceof KpiError && e.status === status

beforeEach(async () => {
  if (!KPI_DB_READY) return
  await resetKpiTestData(prisma)
  await seedKpiPeople(prisma)
})
after(async () => {
  await prisma.$disconnect()
})

async function seedKpis() {
  const teamGoal = await createGoal(lead, { monthKey: '2026-10', scope: 'TEAM', title: 'Grow pipeline' }, now)
  await createKpi(lead, { goalId: teamGoal.id, title: 'Outreach', target: '40 emails', evidenceType: 'NUMBER', ownerIds: [PEOPLE.member.id] }, now)
  const deptGoal = await createGoal(actorFor(PEOPLE.partner), { monthKey: '2026-10', scope: 'DEPARTMENT', departmentKey: 'product', title: 'Ship roadmap' }, now)
  await createKpi(actorFor(PEOPLE.partner), { goalId: deptGoal.id, title: 'Release v2', target: 'Live', evidenceType: 'LINK', ownerIds: [PEOPLE.lead.id, PEOPLE.jp.id] }, now)
}

test('capabilities reflect scope, titles, roles and grants', DB_TEST, async () => {
  const { scope } = await loadKpiContext()
  assert.deepEqual(capabilitiesOf(lead, scope), { inScheme: true, isLeadOrJp: true, isTeamSetter: true, isDepartmentSetter: false, isVerifier: false, isHr: false })
  assert.equal(capabilitiesOf(actorFor(PEOPLE.member), scope).isTeamSetter, false)
  assert.equal(capabilitiesOf(actorFor(PEOPLE.partner), scope).isDepartmentSetter, true)
  assert.equal(capabilitiesOf(actorFor(PEOPLE.partner), scope).inScheme, false)
  assert.equal(capabilitiesOf(actorFor(PEOPLE.verifier, ['VERIFIER']), scope).isVerifier, true)
})

test('team view: own team for a setter, 403 for others, lead picker for HR', DB_TEST, async () => {
  await seedKpis()
  const view = await teamView(lead, '2026-10', null, now)
  assert.deepEqual(view.team.map((p) => p.id), [PEOPLE.member.id])
  assert.equal(view.goals[0].kpis[0].status, 'DRAFT')
  assert.equal(view.month.locked, false)
  await assert.rejects(teamView(actorFor(PEOPLE.member), '2026-10', null, now), isStatus(403))
  await assert.rejects(teamView(lead, '2026-10', PEOPLE.partner.id, now), isStatus(403))
  const hrView = await teamView(hr, '2026-10', null, now)
  assert.equal(hrView.setter, null)
  assert.ok(hrView.setters?.some((p) => p.id === PEOPLE.lead.id))
  await assert.rejects(teamView(lead, '2026-13', null, now), isStatus(400))
})

test('department view defaults to a lead’s own department and hides other departments from them', DB_TEST, async () => {
  await seedKpis()
  const jpView = await departmentView(actorFor(PEOPLE.jp), '2026-10', null, now)
  assert.equal(jpView.department.key, 'product')
  assert.equal(jpView.canEdit, false)
  assert.deepEqual(jpView.departments.map((d) => d.key), ['product'])
  assert.equal(jpView.goals[0].kpis[0].owners.length, 2)
  const partnerView = await departmentView(actorFor(PEOPLE.partner), '2026-10', 'value creation', now)
  assert.equal(partnerView.canEdit, true)
  assert.ok(partnerView.departments.length >= 2)
  await assert.rejects(departmentView(actorFor(PEOPLE.member), '2026-10', 'product', now), isStatus(403))
})

test('my view lists my KPIs with a provisional KPI %', DB_TEST, async () => {
  await seedKpis()
  const mine = await myView(actorFor(PEOPLE.member), '2026-Q4', now)
  assert.deepEqual(mine.kpis.map((k) => [k.title, k.monthKey, k.goalTitle, k.scope]), [['Outreach', '2026-10', 'Grow pipeline', 'TEAM']])
  assert.equal(mine.percent.counted, 1)
  assert.equal(mine.percent.provisional, true)
  await prisma.kpi.updateMany({ where: { title: 'Outreach' }, data: { status: 'VERIFIED' } })
  const later = await myView(actorFor(PEOPLE.member), '2026-Q4', now)
  assert.equal(later.percent.percent, 100)
})

test('verifier view needs verifier rights', DB_TEST, async () => {
  await seedKpis()
  const view = await verifierView(actorFor(PEOPLE.verifier, ['VERIFIER']), '2026-10', now)
  assert.equal(view.goals.length, 2)
  await assert.rejects(verifierView(actorFor(PEOPLE.member), '2026-10', now), isStatus(403))
})

test('HR assigns and removes setters with logged reasons', DB_TEST, async () => {
  const before = await settersOverview()
  assert.ok(before.membersWithoutSetter.some((p) => p.id === PEOPLE.orphan.id))
  await assert.rejects(addSetterAssignment(lead, { employeeId: PEOPLE.orphan.id, setterId: PEOPLE.lead.id, reason: 'No mapping' }), isStatus(403))
  await assert.rejects(addSetterAssignment(hr, { employeeId: PEOPLE.jp.id, setterId: PEOPLE.lead.id, reason: 'JP' }), /department KPIs/)
  await addSetterAssignment(hr, { employeeId: PEOPLE.orphan.id, setterId: PEOPLE.lead.id, reason: 'No mapping' })
  await assert.rejects(addSetterAssignment(hr, { employeeId: PEOPLE.orphan.id, setterId: PEOPLE.lead.id, reason: 'Again' }), isStatus(409))
  const afterAdd = await settersOverview()
  assert.equal(afterAdd.membersWithoutSetter.some((p) => p.id === PEOPLE.orphan.id), false)
  const view = await teamView(lead, '2026-10', null, now)
  assert.ok(view.team.some((p) => p.id === PEOPLE.orphan.id))
  await removeSetterAssignment(hr, afterAdd.assignments[0].id, 'Mapping fixed')
  const events = await prisma.kpiEvent.findMany({ where: { action: { in: ['SETTER_ADD', 'SETTER_REMOVE'] } } })
  assert.equal(events.find((e) => e.action === 'SETTER_ADD')?.reason, 'No mapping')
  assert.equal(events.find((e) => e.action === 'SETTER_REMOVE')?.reason, 'Mapping fixed')
})

test('grants, months and the quarter overview', DB_TEST, async () => {
  await addGrant(hr, { userId: PEOPLE.verifier.id, role: 'VERIFIER' })
  await assert.rejects(addGrant(hr, { userId: PEOPLE.verifier.id, role: 'VERIFIER' }), isStatus(409))
  assert.equal((await grantsOverview()).grants[0].user.id, PEOPLE.verifier.id)
  await seedKpis()
  const months = await listAdminMonths(now)
  assert.deepEqual(months.map((m) => [m.monthKey, m.kpiCount]), [['2026-10', 2]])
  const overview = await quarterOverview('2026-Q4', now)
  const memberRow = overview.rows.find((row) => row.person.id === PEOPLE.member.id)
  assert.equal(memberRow?.kind, 'MEMBER')
  assert.equal(memberRow?.percent.counted, 1)
  assert.equal(overview.rows.find((row) => row.person.id === PEOPLE.jp.id)?.kind, 'LEAD_JP')
  assert.deepEqual(overview.departmentsWithoutKpis[0].departments, ['Value Creation'])
})

test('HR can pick any in-scheme team member to reassign, not only people without a setter', DB_TEST, async () => {
  const overview = await settersOverview()
  const memberIds = overview.members.map((person) => person.id)
  assert.ok(memberIds.includes(PEOPLE.member.id), 'a member who already has a default lead')
  assert.ok(memberIds.includes(PEOPLE.orphan.id))
  assert.equal(memberIds.includes(PEOPLE.lead.id), false, 'leads and JPs have department KPIs')
  assert.equal(memberIds.includes(PEOPLE.partner.id), false, 'Partners are outside the scheme')
})

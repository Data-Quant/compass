import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { prisma } from '../lib/db'
import { claimKpi } from '../lib/kpi/service/claims'
import { KpiError } from '../lib/kpi/service/errors'
import { createGoal, createKpi } from '../lib/kpi/service/goals'
import { auditLog, exportQuarter, monthResults } from '../lib/kpi/service/results'
import { actorFor, DB_TEST, KPI_DB_READY, PEOPLE, resetKpiTestData, seedKpiPeople } from './helpers/kpi-test-db'

const beforeLock = new Date('2026-10-02T08:00:00Z')
const afterLock = new Date('2026-10-20T08:00:00Z')
const lead = actorFor(PEOPLE.lead)
const hr = actorFor(PEOPLE.hr)

beforeEach(async () => {
  if (!KPI_DB_READY) return
  await resetKpiTestData(prisma)
  await seedKpiPeople(prisma)
})
after(async () => {
  await prisma.$disconnect()
})

async function claimedKpi() {
  const goal = await createGoal(lead, { monthKey: '2026-10', scope: 'TEAM', title: 'Grow pipeline' }, beforeLock)
  const kpi = await createKpi(lead, { goalId: goal.id, title: 'Outreach', target: '40 emails', evidenceType: 'LINK', ownerIds: [PEOPLE.member.id] }, beforeLock)
  await createKpi(lead, { goalId: goal.id, title: 'Demos', target: '5 demos', evidenceType: 'LINK', ownerIds: [PEOPLE.member.id] }, beforeLock)
  await claimKpi(lead, kpi.id, { version: 0, outcome: 'DONE', url: 'https://x.example/proof' }, afterLock)
  return kpi
}

test('month results list every KPI with pending counts, for HR only', DB_TEST, async () => {
  await claimedKpi()
  const results = await monthResults(hr, '2026-10', afterLock)
  assert.deepEqual(results.rows.map((row) => [row.title, row.status]).sort(), [['Demos', 'LOCKED'], ['Outreach', 'CLAIMED_DONE']])
  assert.deepEqual(results.pending, { verification: 1, changeRequests: 0 })
  assert.equal(results.month.finalizedAt, null)
  await assert.rejects(monthResults(lead, '2026-10', afterLock), (e: unknown) => e instanceof KpiError && e.status === 403)
})

test('the audit log shows who did what to which KPI', DB_TEST, async () => {
  await claimedKpi()
  const rows = await auditLog(hr, '2026-10')
  const claim = rows.find((row) => row.action === 'CLAIM')
  assert.equal(claim?.kpiTitle, 'Outreach')
  assert.equal(claim?.actorName, 'Test Lead')
  assert.ok(rows.some((row) => row.action === 'GOAL_CREATE'))
})

test('the quarter export has a KPI sheet and a KPI % sheet', DB_TEST, async () => {
  await claimedKpi()
  const buffer = await exportQuarter(hr, '2026-Q4', afterLock)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['KPIs', 'KPI %'])
  const kpiTitles = workbook.getWorksheet('KPIs')!.getColumn(3).values.filter((value) => typeof value === 'string')
  assert.ok(kpiTitles.includes('Outreach'))
})

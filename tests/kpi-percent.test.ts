import test from 'node:test'
import assert from 'node:assert/strict'
import { computeKpiPercent, type PercentKpi } from '../lib/kpi/kpi-percent'
import type { KpiStatusValue } from '../lib/kpi/view-types'

const months = ['2026-10', '2026-11', '2026-12']
const kpi = (monthKey: string, status: KpiStatusValue, assigneeIds = ['amina']): PercentKpi => ({ monthKey, status, assigneeIds })

test('counts only the person’s KPIs, skips cancelled, and only VERIFIED counts as done', () => {
  const result = computeKpiPercent('amina', months, [
    kpi('2026-10', 'VERIFIED'), kpi('2026-10', 'NOT_VERIFIED'), kpi('2026-10', 'VERIFIED'),
    kpi('2026-10', 'CANCELLED'), kpi('2026-10', 'VERIFIED', ['someone-else']),
  ], null)
  assert.equal(result.counted, 3)
  assert.equal(result.verified, 2)
  assert.ok(Math.abs((result.percent ?? 0) - 66.6667) < 0.001)
  assert.equal(result.provisional, false)
})

test('the guide’s Amina quarter: 11 of 13 verified is 84.6%', () => {
  const kpis = [
    ...Array.from({ length: 5 }, (_, i) => kpi('2026-10', i < 4 ? 'VERIFIED' : 'NOT_VERIFIED')),
    ...Array.from({ length: 4 }, () => kpi('2026-11', 'VERIFIED')),
    ...Array.from({ length: 4 }, (_, i) => kpi('2026-12', i < 3 ? 'VERIFIED' : 'NOT_DONE')),
  ]
  const result = computeKpiPercent('amina', months, kpis, null)
  assert.equal(result.counted, 13)
  assert.equal(result.verified, 11)
  assert.equal((result.percent ?? 0).toFixed(1), '84.6')
  assert.deepEqual(result.months.map((m) => [m.monthKey, m.counted, m.verified]), [['2026-10', 5, 4], ['2026-11', 4, 4], ['2026-12', 4, 3]])
})

test('no KPIs means no result, not zero', () => {
  const result = computeKpiPercent('amina', months, [], null)
  assert.equal(result.percent, null)
  assert.equal(result.counted, 0)
})

test('a result is provisional while any counted KPI is unfinished', () => {
  const result = computeKpiPercent('amina', months, [kpi('2026-10', 'VERIFIED'), kpi('2026-11', 'CLAIMED_DONE')], null)
  assert.equal(result.provisional, true)
  assert.equal(result.months[1].pending, 1)
})

test('a leaver’s exit month and later months are excluded', () => {
  const kpis = [kpi('2026-10', 'VERIFIED'), kpi('2026-11', 'NOT_DONE'), kpi('2026-12', 'NOT_DONE')]
  const result = computeKpiPercent('amina', months, kpis, new Date('2026-11-15T10:00:00Z'))
  assert.equal(result.counted, 1)
  assert.equal(result.percent, 100)
})

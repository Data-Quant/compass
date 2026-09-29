import ExcelJS from 'exceljs'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { formatMonthKey, parseMonthKey, parseQuarterKey, quarterMonths } from '../calendar'
import { STATUS_LABELS } from '../format'
import type { KpiActor } from '../permissions'
import { effectiveStatus, isFinalStatus } from '../state-machine'
import type { AuditRow, ResultsResponse, ResultsRow } from '../view-types'
import { quarterOverview } from './admin'
import { byName, departmentLabel, loadKpiContext, personRef, type KpiContext } from './context'
import { KpiError } from './errors'
import { resolveMonth, toMonthView, type ResolvedMonth } from './months'
import { isVisibleKpi } from './views'

function assertHr(actor: KpiActor): void {
  if (actor.role !== 'HR') throw new KpiError('HR access required', 403)
}

async function monthRows(ctx: KpiContext, month: ResolvedMonth, now: Date): Promise<ResultsRow[]> {
  if (!month.id) return []
  const goals = await prisma.kpiGoal.findMany({
    where: { kpiMonthId: month.id, archivedAt: null },
    include: { kpis: { include: { assignees: true }, orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })
  return goals.flatMap((goal) =>
    goal.kpis.filter(isVisibleKpi).map((kpi) => {
      const status = effectiveStatus(kpi.status, month, now)
      return {
        kpiId: kpi.id,
        version: kpi.version,
        title: kpi.title,
        goalTitle: goal.title,
        scope: goal.scope,
        departmentLabel: goal.departmentKey ? departmentLabel(ctx, goal.departmentKey) : null,
        setter: personRef(ctx, goal.setterId),
        owners: kpi.assignees.map((assignee) => personRef(ctx, assignee.userId)).sort(byName),
        status,
        claimedBy: kpi.claimedById ? personRef(ctx, kpi.claimedById) : null,
        decisionNote: kpi.decisionNote,
        final: isFinalStatus(status),
      }
    }),
  )
}

export async function monthResults(actor: KpiActor, monthKey: string, now: Date = new Date()): Promise<ResultsResponse> {
  assertHr(actor)
  const key = parseMonthKey(monthKey)
  if (!key) throw new KpiError('Use a YYYY-MM month')
  const ctx = await loadKpiContext()
  const month = await resolveMonth(key)
  const stored = month.id ? await prisma.kpiMonth.findUnique({ where: { id: month.id } }) : null
  const rows = await monthRows(ctx, month, now)
  const changeRequests = month.id ? await prisma.kpiChangeRequest.count({ where: { status: 'PENDING', kpi: { goal: { kpiMonthId: month.id } } } }) : 0
  return {
    month: { ...toMonthView(month, now), finalizedAt: stored?.finalizedAt?.toISOString() ?? null },
    rows,
    pending: { verification: rows.filter((row) => row.status === 'CLAIMED_DONE' || row.status === 'APPEALED').length, changeRequests },
  }
}

export async function auditLog(actor: KpiActor, monthKey: string | null): Promise<AuditRow[]> {
  assertHr(actor)
  const ctx = await loadKpiContext()
  let where: Prisma.KpiEventWhereInput = {}
  if (monthKey) {
    const key = parseMonthKey(monthKey)
    if (!key) throw new KpiError('Use a YYYY-MM month')
    const month = await resolveMonth(key)
    if (!month.id) return []
    const monthKpiIds = (await prisma.kpi.findMany({ where: { goal: { kpiMonthId: month.id } }, select: { id: true } })).map((kpi) => kpi.id)
    // Deadline events carry only the KPI id, so match the month's KPIs as well as the month itself.
    where = { OR: [{ kpiMonthId: month.id }, { kpiId: { in: monthKpiIds } }] }
  }
  // Newest first; HR narrows by month for older history.
  const events = await prisma.kpiEvent.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 500 })
  const kpiIds = [...new Set(events.flatMap((event) => (event.kpiId ? [event.kpiId] : [])))]
  const kpis = await prisma.kpi.findMany({ where: { id: { in: kpiIds } }, select: { id: true, title: true } })
  const titles = new Map(kpis.map((kpi) => [kpi.id, kpi.title]))
  return events.map((event) => ({
    id: event.id,
    createdAt: event.createdAt.toISOString(),
    actorName: event.actorId ? personRef(ctx, event.actorId).name : 'System',
    actorRole: event.actorRole,
    action: event.action,
    kpiId: event.kpiId,
    kpiTitle: event.kpiId ? titles.get(event.kpiId) ?? null : null,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    reason: event.reason,
  }))
}

export async function exportQuarter(actor: KpiActor, quarterKey: string, now: Date = new Date()): Promise<Buffer> {
  assertHr(actor)
  const quarter = parseQuarterKey(quarterKey)
  if (!quarter) throw new KpiError('Use a YYYY-Qn quarter')
  const ctx = await loadKpiContext()
  const months = await Promise.all(quarterMonths(quarter).map((key) => resolveMonth(key)))
  const workbook = new ExcelJS.Workbook()
  const kpiSheet = workbook.addWorksheet('KPIs')
  kpiSheet.columns = [
    { header: 'Month', key: 'month', width: 10 },
    { header: 'Goal', key: 'goal', width: 30 },
    { header: 'KPI', key: 'kpi', width: 36 },
    { header: 'Scope', key: 'scope', width: 12 },
    { header: 'Department', key: 'department', width: 20 },
    { header: 'Set by', key: 'setter', width: 22 },
    { header: 'Owners', key: 'owners', width: 30 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Claimed by', key: 'claimedBy', width: 22 },
    { header: 'Execution note', key: 'note', width: 40 },
  ]
  for (const month of months) {
    for (const row of await monthRows(ctx, month, now)) {
      kpiSheet.addRow({
        month: formatMonthKey(month),
        goal: row.goalTitle,
        kpi: row.title,
        scope: row.scope === 'TEAM' ? 'Team' : 'Department',
        department: row.departmentLabel ?? '',
        setter: row.setter.name,
        owners: row.owners.map((owner) => owner.name).join(', '),
        status: STATUS_LABELS[row.status],
        claimedBy: row.claimedBy?.name ?? '',
        note: row.decisionNote ?? '',
      })
    }
  }
  const overview = await quarterOverview(quarterKey, now)
  const percentSheet = workbook.addWorksheet('KPI %')
  percentSheet.columns = [
    { header: 'Person', key: 'person', width: 26 },
    { header: 'Department', key: 'department', width: 20 },
    { header: 'Measured on', key: 'kind', width: 16 },
    { header: 'KPIs counted', key: 'counted', width: 12 },
    { header: 'Verified', key: 'verified', width: 10 },
    { header: 'KPI %', key: 'percent', width: 10 },
    { header: 'Provisional', key: 'provisional', width: 12 },
  ]
  for (const row of overview.rows) {
    percentSheet.addRow({
      person: row.person.name,
      department: row.department ?? '',
      kind: row.kind === 'LEAD_JP' ? 'Department KPIs' : 'Team KPIs',
      counted: row.percent.counted,
      verified: row.percent.verified,
      percent: row.percent.percent === null ? '' : Number(row.percent.percent.toFixed(1)),
      provisional: row.percent.provisional ? 'Yes' : 'No',
    })
  }
  for (const sheet of [kpiSheet, percentSheet]) sheet.getRow(1).font = { bold: true }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

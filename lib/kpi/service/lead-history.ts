import { prisma } from '@/lib/db'
import { formatMonthKey, parseMonthKey, type MonthKey } from '../calendar'
import { defaultWindow, leadStats, MAX_HISTORY_MONTHS, monthIndex, type HistoryEvent, type KpiHistory } from '../lead-history'
import { isVerifierEligible, type KpiActor } from '../permissions'
import { effectiveStatus } from '../state-machine'
import type { LeadClaimStats, LeadHistoryResponse } from '../view-types'
import { byName, loadKpiContext, personRef } from './context'
import { KpiError } from './errors'

/** Every KPI in a goal of the window's months (archived goals left out), with its effective status and its events, oldest first. */
async function historiesIn(from: MonthKey, to: MonthKey, now: Date, setterIds?: readonly string[]): Promise<KpiHistory[]> {
  const months = (await prisma.kpiMonth.findMany()).filter((m) => monthIndex(m) >= monthIndex(from) && monthIndex(m) <= monthIndex(to))
  if (months.length === 0) return []
  const kpis = await prisma.kpi.findMany({
    where: { goal: { kpiMonthId: { in: months.map((m) => m.id) }, archivedAt: null, ...(setterIds ? { setterId: { in: [...setterIds] } } : {}) } },
    select: { id: true, status: true, goal: { select: { setterId: true, kpiMonth: true } } },
  })
  const events = kpis.length === 0 ? [] : await prisma.kpiEvent.findMany({
    where: { kpiId: { in: kpis.map((k) => k.id) } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { kpiId: true, action: true, toStatus: true },
  })
  const byKpi = new Map<string, HistoryEvent[]>()
  for (const e of events) if (e.kpiId) byKpi.set(e.kpiId, [...(byKpi.get(e.kpiId) ?? []), { action: e.action, toStatus: e.toStatus }])
  return kpis.map((k) => ({ setterId: k.goal.setterId, status: effectiveStatus(k.status, k.goal.kpiMonth, now), events: byKpi.get(k.id) ?? [] }))
}

function windowOf(input: { fromMonth?: string | null; toMonth?: string | null }, now: Date): { from: MonthKey; to: MonthKey } {
  const fallback = defaultWindow(now)
  const from = parseMonthKey(input.fromMonth || fallback.fromMonth)
  const to = parseMonthKey(input.toMonth || fallback.toMonth)
  if (!from || !to) throw new KpiError('Months must look like 2026-10')
  if (monthIndex(from) > monthIndex(to)) throw new KpiError('The first month must not be after the last')
  if (monthIndex(to) - monthIndex(from) + 1 > MAX_HISTORY_MONTHS) throw new KpiError(`Choose at most ${MAX_HISTORY_MONTHS} months`)
  return { from, to }
}

/** Spec 10.3: for Execution (verifiers) and HR. Flagged leads first, then by rejection rate. */
export async function leadClaimHistory(actor: KpiActor, input: { fromMonth?: string | null; toMonth?: string | null }, now: Date = new Date()): Promise<LeadHistoryResponse> {
  if (!isVerifierEligible(actor)) throw new KpiError('Verifier access required', 403)
  const { from, to } = windowOf(input, now)
  const stats = leadStats(await historiesIn(from, to, now))
  const ctx = await loadKpiContext()
  const rows = [...stats]
    .map(([setterId, s]) => ({ lead: personRef(ctx, setterId), ...s }))
    .sort((a, b) => Number(b.flagged) - Number(a.flagged) || (b.rejectionRate ?? -1) - (a.rejectionRate ?? -1) || byName(a.lead, b.lead))
  return { fromMonth: formatMonthKey(from), toMonth: formatMonthKey(to), rows }
}

/** The verification queue's per-lead rate, over the default window. */
export async function setterRejectionStats(setterIds: readonly string[], now: Date): Promise<Map<string, LeadClaimStats>> {
  if (setterIds.length === 0) return new Map()
  const { from, to } = windowOf({}, now)
  return leadStats(await historiesIn(from, to, now, setterIds))
}

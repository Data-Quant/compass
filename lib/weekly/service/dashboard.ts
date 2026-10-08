import { prisma } from '@/lib/db'
import { categoryCoverage } from '../coverage'
import { evaluatorDrift } from '../drift'
import type { CoverageView, DashboardResponse, EvaluatorStatsView } from '../view-types'
import { loadAnswerRecords } from './answer-states'
import { assertHr, byName, loadPeople, personRef, type WeeklyActor } from './context'
import { cycleSummary, loadCycle } from './cycles'

export async function coverageRows(cycleId: string): Promise<CoverageView[]> {
  const slots = await prisma.weeklySlot.findMany({
    where: { cycleId },
    select: { evaluatorId: true, evaluateeId: true, status: true, competency: { select: { perspective: true } } },
  })
  const rows = categoryCoverage(slots.map((s) => ({ evaluatorId: s.evaluatorId, evaluateeId: s.evaluateeId, perspective: s.competency.perspective, status: s.status })))
  const people = await loadPeople(rows.map((r) => r.evaluateeId))
  return rows
    .map((r) => ({
      evaluatee: personRef(people, r.evaluateeId), perspective: r.perspective, satisfied: r.satisfied, total: r.total,
      evaluatorsContributing: r.evaluatorsContributing, share: r.share, lowEvidence: r.lowEvidence,
    }))
    .sort((a, b) => Number(b.lowEvidence) - Number(a.lowEvidence) || a.share - b.share || byName(a.evaluatee, b.evaluatee))
}

export async function lowEvidenceRows(cycleId: string): Promise<CoverageView[]> {
  return (await coverageRows(cycleId)).filter((row) => row.lowEvidence)
}

async function evaluatorStats(cycleId: string, currentWeek: number): Promise<EvaluatorStatsView[]> {
  const prompts = await prisma.weeklyPrompt.findMany({
    where: { cycleId, kind: { not: 'COMMENT' }, status: { notIn: ['CANCELLED', 'EXPIRED'] } },
    select: { evaluatorId: true, status: true, weekIndex: true },
  })
  const people = await loadPeople(prompts.map((p) => p.evaluatorId))
  const byEvaluator = new Map<string, EvaluatorStatsView>()
  for (const p of prompts) {
    const row = byEvaluator.get(p.evaluatorId) ?? { evaluator: personRef(people, p.evaluatorId), released: 0, answered: 0, notObserved: 0, open: 0, overdue: 0, responseRate: null }
    const open = p.status === 'OPEN' || p.status === 'DRAFT'
    byEvaluator.set(p.evaluatorId, {
      ...row,
      released: row.released + 1,
      answered: row.answered + (p.status === 'SUBMITTED' ? 1 : 0),
      notObserved: row.notObserved + (p.status === 'NOT_OBSERVED' ? 1 : 0),
      open: row.open + (open ? 1 : 0),
      overdue: row.overdue + (open && p.weekIndex < currentWeek ? 1 : 0),
    })
  }
  return [...byEvaluator.values()]
    .map((row) => {
      const handled = row.answered + row.notObserved
      return { ...row, responseRate: handled + row.open > 0 ? handled / (handled + row.open) : null }
    })
    .sort((a, b) => (a.responseRate ?? 1) - (b.responseRate ?? 1) || byName(a.evaluator, b.evaluator))
}

export async function dashboardView(actor: WeeklyActor, cycleId: string, now: Date): Promise<DashboardResponse> {
  assertHr(actor)
  const cycle = await loadCycle(cycleId)
  const summary = cycleSummary(cycle, now)
  const [records, coverage, evaluators] = await Promise.all([loadAnswerRecords({ cycleId }), coverageRows(cycleId), evaluatorStats(cycleId, summary.currentWeek)])
  const drift = evaluatorDrift(records.flatMap((r) => (r.score === null ? [] : [{ evaluatorId: r.evaluatorId, perspective: r.perspective, finalScore: r.score }])))
  const people = await loadPeople(drift.map((d) => d.evaluatorId))
  return {
    cycle: summary,
    coverage,
    evaluators,
    drift: drift.map((d) => ({ evaluator: personRef(people, d.evaluatorId), perspective: d.perspective, difference: d.difference, count: d.count })),
  }
}

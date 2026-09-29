import { prisma } from '@/lib/db'
import { answerWordCount } from '../answer-rules'
import { categoryCoverage } from '../coverage'
import { evaluatorDrift, qualityReport, type QualityRow } from '../quality'
import { isConfirmedAction } from '../reviews'
import type { CoverageView, DashboardResponse, EvaluatorStatsView, ReviewFilter } from '../view-types'
import { jsonStrings, loadAnswerRecords, type AnswerRecord } from './answer-states'
import { assertHr, byName, loadPeople, personRef, type WeeklyActor } from './context'
import { cycleSummary, loadCycle } from './cycles'
import { filterOf, REVIEW_FILTERS } from './review-queue'

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

const confirmedScore = (r: AnswerRecord) => (r.latestReview && isConfirmedAction(r.latestReview.action) ? r.latestReview.finalScore : null)

async function qualityRows(records: readonly AnswerRecord[]): Promise<QualityRow[]> {
  const scored = records.filter((r) => r.aiScore?.sufficiency === 'SUFFICIENT')
  const texts = await prisma.weeklyResponse.findMany({ where: { id: { in: scored.map((r) => r.responseId) } }, select: { id: true, situation: true, action: true, result: true } })
  const words = new Map(texts.map((t) => [t.id, answerWordCount(t)]))
  return records.map((r) => ({
    aiScore: r.aiScore?.sufficiency === 'SUFFICIENT' ? r.aiScore.score : null,
    finalScore: confirmedScore(r),
    humanReviewed: r.latestReview?.reviewerId != null,
    wordCount: words.get(r.responseId) ?? 0,
    flags: r.aiScore ? jsonStrings(r.aiScore.flags) : [],
    topic: r.topic, perspective: r.perspective, evaluatorId: r.evaluatorId, tokens: r.tokens,
  }))
}

export async function dashboardView(actor: WeeklyActor, cycleId: string, now: Date): Promise<DashboardResponse> {
  assertHr(actor)
  const cycle = await loadCycle(cycleId)
  const summary = cycleSummary(cycle, now)
  const records = await loadAnswerRecords({ cycleId })
  const queue = Object.fromEntries(REVIEW_FILTERS.map((filter) => [filter, 0])) as Record<ReviewFilter, number>
  for (const record of records) queue[filterOf(record.state)] += 1
  const [coverage, evaluators, rows] = await Promise.all([coverageRows(cycleId), evaluatorStats(cycleId, summary.currentWeek), qualityRows(records)])
  const confirmed = records.flatMap((r) => {
    const finalScore = confirmedScore(r)
    return finalScore === null ? [] : [{ evaluatorId: r.evaluatorId, perspective: r.perspective, finalScore }]
  })
  const drift = evaluatorDrift(confirmed)
  const people = await loadPeople(drift.map((d) => d.evaluatorId))
  return {
    cycle: summary,
    queue,
    jobs: { pending: queue.SCORING, failed: queue.FAILED },
    coverage,
    evaluators,
    quality: qualityReport(rows),
    drift: drift.map((d) => ({ evaluator: personRef(people, d.evaluatorId), perspective: d.perspective, difference: d.difference, count: d.count })),
  }
}

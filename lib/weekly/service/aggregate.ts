import type { Prisma } from '@prisma/client'
import { buildAggregateRows, type AggregateRow, type AggregationCounts, type CommentAnswer, type ConfirmedScore } from '../aggregation'
import type { Perspective } from '../perspectives'
import { isConfirmedAction } from '../reviews'
import { loadAnswerRecords } from './answer-states'
import { classicPairKeys } from './classic-form'
import { loadPeople } from './context'
import type { CycleWithPeriod } from './cycles'
import { toJson } from './db'

export interface DropRecord { evaluateeId: string; perspective: Perspective; overrides: number }
export interface AggregationResult { runId: string; counts: AggregationCounts }

/** Left by `cutoff`: by the exit date when payroll has one; otherwise an inactive payroll profile counts as left. */
export function hasLeftBy(person: { payrollActive: boolean; exitDate: Date | null }, cutoff: Date): boolean {
  return person.exitDate !== null ? person.exitDate <= cutoff : !person.payrollActive
}

const rowKey = (r: { evaluatorId: string; evaluateeId: string; questionId: string | null; leadQuestionId: string | null }) =>
  `${r.evaluatorId}|${r.evaluateeId}|${r.questionId ?? ''}|${r.leadQuestionId ?? ''}`

/** Unsubmitted classic drafts on a weekly row's question. A submitted one would have made the pair keep its classic rows. */
async function draftsUnder(tx: Prisma.TransactionClient, periodId: string, rows: readonly AggregateRow[]): Promise<string[]> {
  const evaluateeIds = [...new Set(rows.map((r) => r.evaluateeId))]
  if (evaluateeIds.length === 0) return []
  const keys = new Set(rows.map(rowKey))
  const drafts = await tx.evaluation.findMany({
    where: { periodId, evaluateeId: { in: evaluateeIds }, source: 'MANUAL', submittedAt: null },
    select: { id: true, evaluatorId: true, evaluateeId: true, questionId: true, leadQuestionId: true },
  })
  return drafts.filter((d) => keys.has(rowKey(d))).map((d) => d.id)
}

/**
 * Spec 10: replaces the period's AI_WEEKLY rows (all of them, or only `evaluateeIds`') with one row per evaluator, person and
 * question from the latest confirmed decisions, plus comment rows. Records a WeeklyAggregationRun. Runs inside the caller's transaction.
 */
export async function aggregateCycle(
  tx: Prisma.TransactionClient,
  cycle: CycleWithPeriod,
  input: { runById: string; now: Date; drops: readonly DropRecord[]; evaluateeIds?: readonly string[] },
): Promise<AggregationResult> {
  const scope = input.evaluateeIds ? new Set(input.evaluateeIds) : null
  const records = (await loadAnswerRecords({ cycleId: cycle.id }, tx)).filter((r) => scope === null || scope.has(r.evaluateeId))
  const competencyIds = [...new Set(records.flatMap((r) => (r.competencyId ? [r.competencyId] : [])))]
  const competencies = new Map(
    (await tx.weeklyCompetency.findMany({ where: { id: { in: competencyIds } }, select: { id: true, sourceQuestionId: true, sourceLeadQuestionId: true } })).map((c) => [c.id, c]),
  )
  const scores: ConfirmedScore[] = records.flatMap((r) => {
    const review = r.latestReview
    const competency = r.competencyId ? competencies.get(r.competencyId) : undefined
    if (!review || !isConfirmedAction(review.action) || review.finalScore === null || !competency) return []
    return [{ evaluatorId: r.evaluatorId, evaluateeId: r.evaluateeId, questionId: competency.sourceQuestionId, leadQuestionId: competency.sourceLeadQuestionId, score: review.finalScore }]
  })
  const commentPrompts = await tx.weeklyPrompt.findMany({
    where: { cycleId: cycle.id, kind: 'COMMENT', status: 'SUBMITTED', questionId: { not: null }, ...(scope ? { evaluateeId: { in: [...scope] } } : {}) },
    select: { evaluatorId: true, evaluateeId: true, questionId: true, response: { select: { commentText: true } } },
  })
  const comments: CommentAnswer[] = commentPrompts.flatMap((p) =>
    p.questionId && p.response?.commentText ? [{ evaluatorId: p.evaluatorId, evaluateeId: p.evaluateeId, questionId: p.questionId, text: p.response.commentText }] : [],
  )
  const people = await loadPeople([...scores, ...comments].map((x) => x.evaluateeId), tx)
  // Spec 10: people who left before the close get no rows. A challenge re-aggregates after the close, so it uses the close's date.
  const leaverCutoff = cycle.closedAt ?? input.now
  const left = new Set([...people.values()].filter((p) => hasLeftBy(p, leaverCutoff)).map((p) => p.id))
  // Spec 13.3: a pair with a submitted classic answer in the weekly banks keeps its classic rows; its weekly evidence is not written.
  const manualPairs = await classicPairKeys(tx, cycle.periodId)
  const { rows, counts } = buildAggregateRows({ scores, comments, excludedEvaluateeIds: left, manualPairs })
  const run = await tx.weeklyAggregationRun.create({ data: { cycleId: cycle.id, runById: input.runById, counts: toJson(counts), drops: toJson(input.drops) } })
  await tx.evaluation.deleteMany({ where: { periodId: cycle.periodId, source: 'AI_WEEKLY', ...(scope ? { evaluateeId: { in: [...scope] } } : {}) } })
  const drafts = await draftsUnder(tx, cycle.periodId, rows)
  if (drafts.length > 0) await tx.evaluation.deleteMany({ where: { id: { in: drafts } } })
  if (rows.length > 0) {
    await tx.evaluation.createMany({
      data: rows.map((r) => ({
        evaluatorId: r.evaluatorId, evaluateeId: r.evaluateeId, periodId: cycle.periodId, questionId: r.questionId, leadQuestionId: r.leadQuestionId,
        ratingValue: r.ratingValue, textResponse: r.textResponse, submittedAt: input.now, source: 'AI_WEEKLY', aggregationRunId: run.id,
      })),
    })
  }
  const finalCounts: AggregationCounts = { ...counts, clearedClassicDrafts: drafts.length }
  await tx.weeklyAggregationRun.update({ where: { id: run.id }, data: { counts: toJson(finalCounts) } })
  return { runId: run.id, counts: finalCounts }
}

import type { Prisma } from '@prisma/client'
import { buildAggregateRows, type AggregateRow, type AggregationCounts, type CommentAnswer, type ConfirmedScore } from '../aggregation'
import type { Perspective } from '../perspectives'
import { isConfirmedAction } from '../reviews'
import { loadAnswerRecords } from './answer-states'
import { loadPeople } from './context'
import type { CycleWithPeriod } from './cycles'
import { toJson } from './db'

export interface DropRecord { evaluateeId: string; perspective: Perspective; overrides: number }
export interface AggregationResult { runId: string; counts: AggregationCounts }

export function hasLeftBy(person: { payrollActive: boolean; exitDate: Date | null }, now: Date): boolean {
  return !person.payrollActive || (person.exitDate !== null && person.exitDate <= now)
}

const rowKey = (r: { evaluatorId: string; evaluateeId: string; questionId: string | null; leadQuestionId: string | null }) =>
  `${r.evaluatorId}|${r.evaluateeId}|${r.questionId ?? ''}|${r.leadQuestionId ?? ''}`

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
  const left = new Set([...people.values()].filter((p) => hasLeftBy(p, input.now)).map((p) => p.id))
  const { rows, counts } = buildAggregateRows({ scores, comments, excludedEvaluateeIds: left })
  const run = await tx.weeklyAggregationRun.create({ data: { cycleId: cycle.id, runById: input.runById, counts: toJson(counts), drops: toJson(input.drops) } })
  await tx.evaluation.deleteMany({ where: { periodId: cycle.periodId, source: 'AI_WEEKLY', ...(scope ? { evaluateeId: { in: [...scope] } } : {}) } })
  const evaluateeIds = [...new Set(rows.map((r) => r.evaluateeId))]
  const existing = evaluateeIds.length === 0 ? [] : await tx.evaluation.findMany({
    where: { periodId: cycle.periodId, evaluateeId: { in: evaluateeIds } },
    select: { id: true, evaluatorId: true, evaluateeId: true, questionId: true, leadQuestionId: true },
  })
  const existingByKey = new Map(existing.map((e) => [rowKey(e), e.id]))
  const values = (r: AggregateRow) => ({ ratingValue: r.ratingValue, textResponse: r.textResponse, submittedAt: input.now, source: 'AI_WEEKLY', aggregationRunId: run.id })
  const fresh = rows.filter((r) => !existingByKey.has(rowKey(r)))
  if (fresh.length > 0) {
    await tx.evaluation.createMany({
      data: fresh.map((r) => ({ evaluatorId: r.evaluatorId, evaluateeId: r.evaluateeId, periodId: cycle.periodId, questionId: r.questionId, leadQuestionId: r.leadQuestionId, ...values(r) })),
    })
  }
  let replacedManual = 0
  for (const r of rows) {
    const id = existingByKey.get(rowKey(r))
    if (!id) continue
    // A classic row for the same evaluator, person and question (e.g. a draft from before the cycle) is taken over.
    await tx.evaluation.update({ where: { id }, data: values(r) })
    replacedManual += 1
  }
  const finalCounts: AggregationCounts = { ...counts, replacedManual }
  await tx.weeklyAggregationRun.update({ where: { id: run.id }, data: { counts: toJson(finalCounts) } })
  return { runId: run.id, counts: finalCounts }
}

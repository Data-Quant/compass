import type { Prisma } from '@prisma/client'
import { isHrFilledPartner } from '../partners'
import { buildAggregateRows, type AggregationCounts, type CommentAnswer, type ConfirmedScore } from '../aggregation'
import type { Perspective } from '../perspectives'
import { loadAnswerRecords } from './answer-states'
import { loadPeople } from './context'
import type { CycleWithPeriod } from './cycles'
import { toJson } from './db'

export interface DropRecord { evaluateeId: string; perspective: Perspective; overrides: number }
export interface AggregationResult { runId: string; counts: AggregationCounts }

/** Left by `cutoff`: by the exit date when payroll has one; otherwise an inactive payroll profile counts as left. */
export function hasLeftBy(person: { payrollActive: boolean; exitDate: Date | null }, cutoff: Date): boolean {
  return person.exitDate !== null ? person.exitDate <= cutoff : !person.payrollActive
}

/**
 * Spec 10: replaces the period's AI_WEEKLY rows (all of them, or only `evaluateeIds`') with one row per evaluator, person and
 * question from the chosen statements' scores, plus comment rows. Records a WeeklyAggregationRun. Runs inside the caller's transaction.
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
    const competency = r.competencyId ? competencies.get(r.competencyId) : undefined
    // Only HR's confirmed scores count.
    if (!competency || r.score === null) return []
    return [{ evaluatorId: r.evaluatorId, evaluateeId: r.evaluateeId, questionId: competency.sourceQuestionId, leadQuestionId: competency.sourceLeadQuestionId, score: r.score }]
  })
  const commentPrompts = await tx.weeklyPrompt.findMany({
    where: { cycleId: cycle.id, kind: 'COMMENT', status: 'SUBMITTED', questionId: { not: null }, ...(scope ? { evaluateeId: { in: [...scope] } } : {}) },
    select: { evaluatorId: true, evaluateeId: true, questionId: true, response: { select: { commentText: true } } },
  })
  const comments: CommentAnswer[] = commentPrompts.flatMap((p) =>
    p.questionId && p.response?.commentText ? [{ evaluatorId: p.evaluatorId, evaluateeId: p.evaluateeId, questionId: p.questionId, text: p.response.commentText }] : [],
  )
  const people = await loadPeople([...scores, ...comments].flatMap((x) => [x.evaluateeId, x.evaluatorId]), tx)
  // HR fills in partners' evaluations at the end of the quarter; weekly answers they gave earlier are not counted twice.
  const fromPartners = (x: { evaluatorId: string }) => isHrFilledPartner(people.get(x.evaluatorId)?.name)
  // Spec 10: people who left before the close get no rows. A challenge re-aggregates after the close, so it uses the close's date.
  const leaverCutoff = cycle.closedAt ?? input.now
  const left = new Set([...people.values()].filter((p) => hasLeftBy(p, leaverCutoff)).map((p) => p.id))
  const { rows, counts } = buildAggregateRows({ scores: scores.filter((s) => !fromPartners(s)), comments: comments.filter((c) => !fromPartners(c)), excludedEvaluateeIds: left })
  const run = await tx.weeklyAggregationRun.create({ data: { cycleId: cycle.id, runById: input.runById, counts: toJson(counts), drops: toJson(input.drops) } })
  await tx.evaluation.deleteMany({ where: { periodId: cycle.periodId, source: 'AI_WEEKLY', ...(scope ? { evaluateeId: { in: [...scope] } } : {}) } })
  if (rows.length > 0) {
    await tx.evaluation.createMany({
      data: rows.map((r) => ({
        evaluatorId: r.evaluatorId, evaluateeId: r.evaluateeId, periodId: cycle.periodId, questionId: r.questionId, leadQuestionId: r.leadQuestionId,
        ratingValue: r.ratingValue, textResponse: r.textResponse, submittedAt: input.now, source: 'AI_WEEKLY', aggregationRunId: run.id,
      })),
    })
  }
  return { runId: run.id, counts }
}

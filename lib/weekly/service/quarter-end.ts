// What HR's quarter-end tables and the late forms share: the questions an evaluator answers, and whom an earlier
// quarter (one run on the earlier evaluations, with no weekly round) evaluates.
import type { RelationshipType } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getResolvedEvaluationQuestions } from '@/lib/pre-evaluation'
import { evaluateeExclusion } from '../eligibility'
import { loadPeople } from './context'
import { WeeklyError } from './errors'

export type QuarterEndQuestion = Awaited<ReturnType<typeof getResolvedEvaluationQuestions>>['questions'][number]

/**
 * The questions this evaluator answers for this relationship: the bank's, plus a lead's own pre-evaluation questions
 * for TEAM_LEAD. A department's own weekly topics apply only to that department, so they are left out.
 */
export async function quarterEndQuestions(periodId: string, evaluatorId: string, type: RelationshipType, evaluateeId: string): Promise<QuarterEndQuestion[]> {
  const resolved = await getResolvedEvaluationQuestions({ relationshipType: type, periodId, evaluatorId, evaluateeId })
  if (resolved.error) throw new WeeklyError(resolved.error, 409)
  const topics = await prisma.weeklyCompetency.findMany({ where: { sourceQuestionId: { not: null } }, select: { sourceQuestionId: true, departments: true } })
  const common = new Set(topics.filter((t) => t.departments.length === 0).map((t) => t.sourceQuestionId))
  const departmentOnly = new Set(topics.filter((t) => t.departments.length > 0 && !common.has(t.sourceQuestionId)).map((t) => t.sourceQuestionId))
  return resolved.questions.filter((q) => !(q.sourceType === 'GLOBAL' && departmentOnly.has(q.id)))
}

/** An earlier quarter's people, as of its last day: nobody who had left by then or joined after it. */
export async function evaluatedAtQuarterEnd(endDate: Date, ids: Iterable<string>): Promise<Set<string>> {
  const asOf = { now: endDate, opensAt: endDate, optedIn: false }
  return new Set([...(await loadPeople(ids)).values()].filter((p) => !evaluateeExclusion(p, asOf)).map((p) => p.id))
}

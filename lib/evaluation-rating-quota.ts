import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { RelationshipType } from '@/types'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { buildEvaluationPairKey } from '@/lib/evaluation-completion'
import { getResolvedQuestionCount } from '@/lib/pre-evaluation'

type DbClient = typeof prisma | Prisma.TransactionClient

type AssignmentLike = {
  evaluatorId: string
  evaluateeId: string
  relationshipType: RelationshipType
}

export function buildEvaluationResponseKey(
  evaluateeId: string,
  questionSource: 'GLOBAL' | 'LEAD',
  questionId: string
) {
  return `${evaluateeId}:${questionSource}:${questionId}`
}

export function getMaxAllowedFourRatings(totalQuestions: number) {
  if (totalQuestions <= 0) {
    return 0
  }

  return Math.max(1, Math.floor(totalQuestions * 0.1))
}

export function countFourRatingsForResponses(
  responses: Array<{ ratingValue?: number | null }>
) {
  return responses.filter((response) => response.ratingValue === 4).length
}

export function shouldCountAssignmentTowardsFourRatingQuota(params: {
  assignment: AssignmentLike
}) {
  return params.assignment.relationshipType !== 'HR'
}

export function validateFourRatingQuota(params: {
  totalQuestions: number
  usedFourRatings: number
  pendingFourRatings: number
}) {
  const maxAllowedFourRatings = getMaxAllowedFourRatings(params.totalQuestions)
  const nextFourRatings = params.usedFourRatings + params.pendingFourRatings

  return {
    maxAllowedFourRatings,
    nextFourRatings,
    wouldExceed: nextFourRatings > maxAllowedFourRatings,
  }
}

export async function getEvaluatorFourRatingQuota(params: {
  periodId: string
  evaluatorId: string
  excludeResponseKeys?: ReadonlySet<string>
  db?: DbClient
}) {
  const db = params.db || prisma

  const [assignments, submittedFourRatings] = await Promise.all([
    getResolvedEvaluationAssignments(params.periodId, { db }),
    db.evaluation.findMany({
      where: {
        periodId: params.periodId,
        evaluatorId: params.evaluatorId,
        submittedAt: { not: null },
        ratingValue: 4,
      },
      select: {
        evaluateeId: true,
        questionId: true,
        leadQuestionId: true,
      },
    }),
  ])

  const activeAssignments = assignments.filter(
    (assignment) =>
      assignment.evaluatorId === params.evaluatorId &&
      shouldCountAssignmentTowardsFourRatingQuota({
        assignment,
      })
  )

  const questionCounts = await Promise.all(
    activeAssignments.map((assignment) =>
      getResolvedQuestionCount({
        relationshipType: assignment.relationshipType,
        periodId: params.periodId,
        evaluatorId: assignment.evaluatorId,
        evaluateeId: assignment.evaluateeId,
      })
    )
  )

  const totalQuestions = questionCounts.reduce((sum, count) => sum + count, 0)
  const excludedKeys = params.excludeResponseKeys || new Set<string>()
  const assignmentTypesByPairKey = new Map(
    assignments
      .filter((assignment) => assignment.evaluatorId === params.evaluatorId)
      .map((assignment) => [
        buildEvaluationPairKey(assignment.evaluatorId, assignment.evaluateeId),
        assignment.relationshipType,
      ] as const)
  )
  const usedFourRatings = submittedFourRatings.filter((evaluation) => {
    const questionId = evaluation.questionId || evaluation.leadQuestionId
    const questionSource = evaluation.questionId ? 'GLOBAL' : 'LEAD'
    const pairRelationshipType = assignmentTypesByPairKey.get(
      buildEvaluationPairKey(params.evaluatorId, evaluation.evaluateeId)
    )

    if (!questionId || pairRelationshipType === 'HR') {
      return false
    }

    return !excludedKeys.has(
      buildEvaluationResponseKey(evaluation.evaluateeId, questionSource, questionId)
    )
  }).length
  const maxAllowedFourRatings = getMaxAllowedFourRatings(totalQuestions)

  return {
    totalQuestions,
    usedFourRatings,
    maxAllowedFourRatings,
    remainingFourRatings: Math.max(0, maxAllowedFourRatings - usedFourRatings),
  }
}

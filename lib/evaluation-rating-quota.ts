import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  normalizeRelationshipTypeForWeighting,
  type RelationshipType,
} from '@/types'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { buildEvaluationPairKey } from '@/lib/evaluation-completion'
import { getResolvedQuestionCount } from '@/lib/pre-evaluation'
import {
  groupDeptAssignmentsByDepartment,
  normalizeDepartmentPoolKey,
} from '@/lib/dept-evaluation-pool'

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

export function buildDepartmentEvaluationResponseKey(
  department: string | null | undefined,
  questionSource: 'GLOBAL' | 'LEAD',
  questionId: string
) {
  return `DEPT:${normalizeDepartmentPoolKey(department)}:${questionSource}:${questionId}`
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

export function getFourRatingQuotaScopeType(relationshipType: RelationshipType) {
  return normalizeRelationshipTypeForWeighting(relationshipType)
}

export function shouldCountAssignmentTowardsFourRatingQuota(params: {
  assignment: AssignmentLike
}) {
  return getFourRatingQuotaScopeType(params.assignment.relationshipType) !== 'HR'
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
  relationshipType: RelationshipType
  excludeResponseKeys?: ReadonlySet<string>
  db?: DbClient
}) {
  const db = params.db || prisma
  const quotaRelationshipType = getFourRatingQuotaScopeType(params.relationshipType)

  const [assignments, submittedFourRatings] = await Promise.all([
    getResolvedEvaluationAssignments(params.periodId, { db, includeUsers: true }),
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

  const evaluateeDepartments = new Map(
    (
      await db.user.findMany({
        where: {
          id: {
            in: [...new Set(submittedFourRatings.map((evaluation) => evaluation.evaluateeId))],
          },
        },
        select: {
          id: true,
          department: true,
        },
      })
    ).map((user) => [user.id, user.department] as const)
  )

  const activeAssignments = assignments.filter(
    (assignment) =>
      assignment.evaluatorId === params.evaluatorId &&
      getFourRatingQuotaScopeType(assignment.relationshipType) === quotaRelationshipType &&
      shouldCountAssignmentTowardsFourRatingQuota({
        assignment,
      })
  )

  const quotaAssignments =
    quotaRelationshipType === 'DEPT'
      ? [...groupDeptAssignmentsByDepartment(activeAssignments).values()].map((group) => group[0])
      : activeAssignments

  const questionCounts = await Promise.all(
    quotaAssignments.map((assignment) =>
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
        getFourRatingQuotaScopeType(assignment.relationshipType),
      ] as const)
  )
  const usedFourRatings = submittedFourRatings.filter((evaluation) => {
    const questionId = evaluation.questionId || evaluation.leadQuestionId
    const questionSource = evaluation.questionId ? 'GLOBAL' : 'LEAD'
    const pairRelationshipType = assignmentTypesByPairKey.get(
      buildEvaluationPairKey(params.evaluatorId, evaluation.evaluateeId)
    )

    if (!questionId || pairRelationshipType !== quotaRelationshipType) {
      return false
    }

    const responseKey =
      quotaRelationshipType === 'DEPT'
        ? buildDepartmentEvaluationResponseKey(
            evaluateeDepartments.get(evaluation.evaluateeId),
            questionSource,
            questionId
          )
        : buildEvaluationResponseKey(evaluation.evaluateeId, questionSource, questionId)

    return !excludedKeys.has(responseKey)
  }).filter((evaluation, index, collection) => {
    if (quotaRelationshipType !== 'DEPT') {
      return true
    }

    const questionId = evaluation.questionId || evaluation.leadQuestionId
    const questionSource = evaluation.questionId ? 'GLOBAL' : 'LEAD'
    const responseKey = buildDepartmentEvaluationResponseKey(
      evaluateeDepartments.get(evaluation.evaluateeId),
      questionSource,
      questionId!
    )

    return collection.findIndex((candidate) => {
      const candidateQuestionId = candidate.questionId || candidate.leadQuestionId
      const candidateQuestionSource = candidate.questionId ? 'GLOBAL' : 'LEAD'
      return (
        buildDepartmentEvaluationResponseKey(
          evaluateeDepartments.get(candidate.evaluateeId),
          candidateQuestionSource,
          candidateQuestionId!
        ) === responseKey
      )
    }) === index
  }).length
  const maxAllowedFourRatings = getMaxAllowedFourRatings(totalQuestions)

  return {
    quotaRelationshipType,
    totalQuestions,
    usedFourRatings,
    maxAllowedFourRatings,
    remainingFourRatings: Math.max(0, maxAllowedFourRatings - usedFourRatings),
  }
}

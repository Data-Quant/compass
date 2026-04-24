import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type { RelationshipType } from '@/types'
import { getResolvedEvaluationQuestions, getEvaluationQuestionMeta } from '@/lib/pre-evaluation'
import {
  getResolvedEvaluationAssignmentForPair,
  getResolvedEvaluationAssignments,
} from '@/lib/evaluation-assignments'
import {
  buildSubmittedCountMap,
  deriveSubmittedHrPairKeys,
  getAssignmentCompletionState,
  getHrPoolClosedPairKeys,
} from '@/lib/evaluation-completion'
import { getEvaluatorFourRatingQuota } from '@/lib/evaluation-rating-quota'
import {
  getDeptEvaluationPoolContext,
  getDeptPoolDisplayName,
  getDeptPoolMemberLabel,
  selectAuthoritativeDeptPoolEvaluateeId,
} from '@/lib/dept-evaluation-pool'
import {
  buildAssignmentLookup,
  resolveEvaluationRelationshipTypeForRow,
} from '@/lib/evaluation-relationship-resolution'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ evaluateeId: string }> }
) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const periodId = searchParams.get('periodId')
    const relationshipType = searchParams.get('relationshipType') as RelationshipType | null

    if (!periodId) {
      return NextResponse.json(
        { error: 'periodId is required' },
        { status: 400 }
      )
    }

    const { evaluateeId } = await params

    const assignment = await getResolvedEvaluationAssignmentForPair(
      periodId,
      user.id,
      evaluateeId,
      relationshipType || undefined
    )

    if (!assignment) {
      return NextResponse.json(
        { error: 'You are not authorized to evaluate this person' },
        { status: 403 }
      )
    }

    const deptPool =
      assignment.relationshipType === 'DEPT'
        ? await getDeptEvaluationPoolContext({
            periodId,
            evaluatorId: user.id,
            evaluateeId,
          })
        : null

    const [resolved, fourRatingQuota] = await Promise.all([
      getResolvedEvaluationQuestions({
        relationshipType: assignment.relationshipType as RelationshipType,
        periodId,
        evaluatorId: user.id,
        evaluateeId,
      }),
      assignment.relationshipType === 'HR'
        ? Promise.resolve(null)
        : getEvaluatorFourRatingQuota({
            periodId,
            evaluatorId: user.id,
            relationshipType: assignment.relationshipType,
          }),
    ])
    

    if (resolved.error) {
      return NextResponse.json({ error: resolved.error }, { status: 400 })
    }

    // Get existing evaluations
    const targetEvaluateeIds = deptPool?.evaluateeIds || [evaluateeId]
    const evaluations = await prisma.evaluation.findMany({
      where: {
        evaluatorId: user.id,
        evaluateeId: { in: targetEvaluateeIds },
        periodId,
      },
      include: {
        question: true,
        leadQuestion: true,
      },
    })
    const submittedEvaluationsForCounts = await prisma.evaluation.findMany({
      where: {
        periodId,
        evaluateeId: { in: targetEvaluateeIds },
        submittedAt: { not: null },
      },
      select: {
        evaluatorId: true,
        evaluateeId: true,
        submittedAt: true,
        leadQuestionId: true,
        question: { select: { relationshipType: true } },
      },
    })
    const relevantAssignments = deptPool
      ? await getResolvedEvaluationAssignments(periodId, {
          evaluatorId: user.id,
        })
      : await getResolvedEvaluationAssignments(periodId, {
          evaluateeId,
        })
    const submittedCounts = buildSubmittedCountMap(
      submittedEvaluationsForCounts,
      relevantAssignments
    )
    const hrPoolClosedPairKeys = getHrPoolClosedPairKeys(
      relevantAssignments,
      deriveSubmittedHrPairKeys(submittedCounts)
    )
    const assignmentLookup = buildAssignmentLookup(
      relevantAssignments.map((candidate) => ({
        evaluatorId: candidate.evaluatorId,
        evaluateeId: candidate.evaluateeId,
        relationshipType: candidate.relationshipType as RelationshipType,
      }))
    )
    const sourceEvaluateeId = deptPool
      ? selectAuthoritativeDeptPoolEvaluateeId({
          evaluateeIds: deptPool.evaluateeIds,
          evaluations,
        })
      : evaluateeId
    const sourceAssignment =
      deptPool?.assignments.find((candidate) => candidate.evaluateeId === sourceEvaluateeId) ||
      assignment
    const sourceEvaluations = evaluations.filter((evaluation) => {
      if (evaluation.evaluateeId !== sourceEvaluateeId) {
        return false
      }

      if (!deptPool) {
        return true
      }

      return (
        resolveEvaluationRelationshipTypeForRow({
          evaluation,
          assignmentLookup,
        }) === 'DEPT'
      )
    })
    const completionState = deptPool
      ? {
          isComplete:
            resolved.questions.length > 0 &&
            sourceEvaluations.filter((evaluation) => evaluation.submittedAt).length >=
              resolved.questions.length,
          isClosedByPool: false,
        }
      : getAssignmentCompletionState({
          assignment,
          questionsCount: resolved.questions.length,
          submittedCounts,
          hrPoolClosedPairKeys,
        })
    const isClosedByPool = completionState.isClosedByPool

    // Map evaluations to questions
    const evaluationMap = new Map(
      sourceEvaluations
        .map((evaluation) => {
          const meta = getEvaluationQuestionMeta(evaluation)
          if (!meta) return null
          return [meta.key, evaluation] as const
        })
        .filter(Boolean) as Array<readonly [string, (typeof evaluations)[number]]>
    )

    const questionsWithResponses = resolved.questions.map((question) => {
      const evaluation = evaluationMap.get(`${question.sourceType}:${question.id}`)
      return {
        ...question,
        id: question.id,
        questionSource: question.sourceType,
        ratingValue: evaluation?.ratingValue ?? null,
        textResponse: evaluation?.textResponse ?? null,
        submittedAt: evaluation?.submittedAt,
      }
    })

    return NextResponse.json({
      evaluatee: deptPool
        ? {
            id: sourceAssignment.evaluateeId,
            name: getDeptPoolDisplayName(deptPool.summary.department),
            department: deptPool.summary.department,
            position: getDeptPoolMemberLabel(deptPool.summary.memberCount),
          }
        : await prisma.user.findUnique({
            where: { id: evaluateeId },
            select: {
              id: true,
              name: true,
              department: true,
              position: true,
            },
          }),
      relationshipType: assignment.relationshipType,
      questions: questionsWithResponses,
      isSubmitted: completionState.isComplete,
      isClosedByPool,
      fourRatingQuota,
    })
  } catch (error) {
    console.error('Failed to fetch evaluation data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch evaluation data' },
      { status: 500 }
    )
  }
}

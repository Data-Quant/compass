import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { z } from 'zod'
import {
  RELATIONSHIP_TYPE_LABELS,
  type RelationshipType,
} from '@/types'
import { getResolvedEvaluationQuestions } from '@/lib/pre-evaluation'
import {
  getResolvedEvaluationAssignmentForPair,
  getResolvedEvaluationAssignments,
} from '@/lib/evaluation-assignments'
import {
  isEvaluationResponseComplete,
  normalizeEvaluationTextResponse,
  ratingRequiresExplanation,
} from '@/lib/evaluation-response'
import {
  buildEvaluationPairKey,
  getHrPoolClosedPairKeys,
} from '@/lib/evaluation-completion'
import {
  buildEvaluationResponseKey,
  countFourRatingsForResponses,
  getEvaluatorFourRatingQuota,
  validateFourRatingQuota,
} from '@/lib/evaluation-rating-quota'

const evaluationSchema = z.object({
  evaluateeId: z.string().trim().min(1),
  periodId: z.string().trim().min(1),
  responses: z.array(
    z.object({
      questionId: z.string().trim().min(1),
      questionSource: z.enum(['GLOBAL', 'LEAD']),
      ratingValue: z.number().min(1).max(4).optional(),
      textResponse: z.string().max(5000).optional(),
    })
  ).min(1),
})

const evaluationDraftSchema = z.object({
  evaluateeId: z.string().trim().min(1),
  periodId: z.string().trim().min(1),
  questionId: z.string().trim().min(1),
  questionSource: z.enum(['GLOBAL', 'LEAD']),
  ratingValue: z.number().min(1).max(4).nullable().optional(),
  textResponse: z.string().max(5000).nullable().optional(),
})

async function findExistingEvaluation(params: {
  evaluatorId: string
  evaluateeId: string
  periodId: string
  questionId: string
  questionSource: 'GLOBAL' | 'LEAD'
}) {
  return prisma.evaluation.findFirst({
    where: {
      evaluatorId: params.evaluatorId,
      evaluateeId: params.evaluateeId,
      periodId: params.periodId,
      questionId: params.questionSource === 'GLOBAL' ? params.questionId : null,
      leadQuestionId: params.questionSource === 'LEAD' ? params.questionId : null,
    },
  })
}

async function getHrPoolSubmissionState(params: {
  periodId: string
  evaluateeId: string
  evaluatorId: string
}) {
  const [assignments, submittedPairs] = await Promise.all([
    getResolvedEvaluationAssignments(params.periodId, {
      evaluateeId: params.evaluateeId,
    }),
    prisma.evaluation.groupBy({
      by: ['evaluatorId', 'evaluateeId'],
      where: {
        periodId: params.periodId,
        evaluateeId: params.evaluateeId,
        submittedAt: { not: null },
      },
      _count: { id: true },
    }),
  ])

  const submittedPairKeys = new Set(
    submittedPairs.map((submittedPair) =>
      buildEvaluationPairKey(submittedPair.evaluatorId, submittedPair.evaluateeId)
    )
  )
  const hrPoolClosedPairKeys = getHrPoolClosedPairKeys(assignments, submittedPairKeys)
  const currentPairKey = buildEvaluationPairKey(params.evaluatorId, params.evaluateeId)

  return {
    currentPairHasSubmittedEvaluation: submittedPairKeys.has(currentPairKey),
    isClosedByAnotherHrEvaluator:
      hrPoolClosedPairKeys.has(currentPairKey) && !submittedPairKeys.has(currentPairKey),
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = evaluationSchema.parse(body)

    // Check if period is locked
    const period = await prisma.evaluationPeriod.findUnique({
      where: { id: data.periodId },
    })

    if (period?.isLocked) {
      return NextResponse.json(
        { error: 'This evaluation period is locked. Submissions are no longer accepted.' },
        { status: 403 }
      )
    }

    const assignment = await getResolvedEvaluationAssignmentForPair(
      data.periodId,
      user.id,
      data.evaluateeId
    )

    if (!assignment) {
      return NextResponse.json(
        { error: 'You are not authorized to evaluate this person' },
        { status: 403 }
      )
    }

    if (assignment.relationshipType === 'HR') {
      const hrPoolState = await getHrPoolSubmissionState({
        periodId: data.periodId,
        evaluateeId: data.evaluateeId,
        evaluatorId: user.id,
      })

      if (hrPoolState.isClosedByAnotherHrEvaluator) {
        return NextResponse.json(
          { error: 'An HR evaluation has already been submitted for this employee. This HR slot is closed.' },
          { status: 409 }
        )
      }
    }

    const resolved = await getResolvedEvaluationQuestions({
      relationshipType: assignment.relationshipType as RelationshipType,
      periodId: data.periodId,
      evaluatorId: user.id,
      evaluateeId: data.evaluateeId,
    })

    if (resolved.error) {
      return NextResponse.json({ error: resolved.error }, { status: 400 })
    }

    const allowedQuestions = new Map<string, (typeof resolved.questions)[number]>(
      resolved.questions.map((question) => [`${question.sourceType}:${question.id}`, question] as const)
    )
    if (allowedQuestions.size === 0) {
      return NextResponse.json(
        { error: 'No evaluation questions configured for this relationship type' },
        { status: 400 }
      )
    }

    const seenQuestionIds = new Set<string>()
    for (const response of data.responses) {
      const questionKey = `${response.questionSource}:${response.questionId}`
      const allowedQuestion = allowedQuestions.get(questionKey)
      if (!allowedQuestion) {
        return NextResponse.json(
          { error: 'One or more questions are not valid for this evaluation relationship' },
          { status: 400 }
        )
      }
      if (seenQuestionIds.has(questionKey)) {
        return NextResponse.json(
          { error: 'Duplicate question responses are not allowed' },
          { status: 400 }
        )
      }
      seenQuestionIds.add(questionKey)

      if (
        !isEvaluationResponseComplete({
          questionType: allowedQuestion.questionType,
          ratingValue: response.ratingValue,
          textResponse: response.textResponse,
        })
      ) {
        return NextResponse.json(
          {
            error: ratingRequiresExplanation(response.ratingValue)
              ? `Explanation is required for ratings of 1 or 4 on "${allowedQuestion.questionText}".`
              : `A rating is required for "${allowedQuestion.questionText}".`,
          },
          { status: 400 }
        )
      }
    }

    if (assignment.relationshipType !== 'HR') {
      const currentSubmissionResponseKeys = new Set(
        data.responses.map((response) =>
          buildEvaluationResponseKey(
            data.evaluateeId,
            response.questionSource,
            response.questionId
          )
        )
      )
      const fourRatingQuota = await getEvaluatorFourRatingQuota({
        periodId: data.periodId,
        evaluatorId: user.id,
        relationshipType: assignment.relationshipType,
        excludeResponseKeys: currentSubmissionResponseKeys,
      })
      const quotaValidation = validateFourRatingQuota({
        totalQuestions: fourRatingQuota.totalQuestions,
        usedFourRatings: fourRatingQuota.usedFourRatings,
        pendingFourRatings: countFourRatingsForResponses(data.responses),
      })

      if (quotaValidation.wouldExceed) {
        return NextResponse.json(
          {
            error: `Ratings of 4 are capped at ${quotaValidation.maxAllowedFourRatings} across your ${fourRatingQuota.totalQuestions} ${RELATIONSHIP_TYPE_LABELS[fourRatingQuota.quotaRelationshipType].toLowerCase()} evaluation questions this period. You have already used ${fourRatingQuota.usedFourRatings} in this category.`,
          },
          { status: 400 }
        )
      }
    }

    // Save or update evaluations
    const evaluations = []
    for (const response of data.responses) {
      const existing = await findExistingEvaluation({
        evaluatorId: user.id,
        evaluateeId: data.evaluateeId,
        periodId: data.periodId,
        questionId: response.questionId,
        questionSource: response.questionSource,
      })

      const payload = {
        ratingValue: response.ratingValue ?? null,
        textResponse: normalizeEvaluationTextResponse(response.textResponse),
        submittedAt: new Date(),
      }

      const evaluation = existing
        ? await prisma.evaluation.update({
            where: { id: existing.id },
            data: payload,
          })
        : await prisma.evaluation.create({
            data: {
              evaluatorId: user.id,
              evaluateeId: data.evaluateeId,
              periodId: data.periodId,
              questionId: response.questionSource === 'GLOBAL' ? response.questionId : null,
              leadQuestionId: response.questionSource === 'LEAD' ? response.questionId : null,
              ...payload,
            },
          })
      evaluations.push(evaluation)
    }

    return NextResponse.json({ success: true, evaluations })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }
    console.error('Failed to submit evaluation:', error)
    return NextResponse.json(
      { error: 'Failed to submit evaluation' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = evaluationDraftSchema.parse(body)
    const { evaluateeId, periodId, questionId, questionSource, ratingValue, textResponse } = data

    // Check if period is locked
    const period = await prisma.evaluationPeriod.findUnique({
      where: { id: periodId },
    })

    if (period?.isLocked) {
      return NextResponse.json(
        { error: 'This evaluation period is locked. Submissions are no longer accepted.' },
        { status: 403 }
      )
    }

    const assignment = await getResolvedEvaluationAssignmentForPair(periodId, user.id, evaluateeId)

    if (!assignment) {
      return NextResponse.json(
        { error: 'You are not authorized to evaluate this person' },
        { status: 403 }
      )
    }

    if (assignment.relationshipType === 'HR') {
      const hrPoolState = await getHrPoolSubmissionState({
        periodId,
        evaluateeId,
        evaluatorId: user.id,
      })

      if (hrPoolState.isClosedByAnotherHrEvaluator) {
        return NextResponse.json(
          { error: 'An HR evaluation has already been submitted for this employee. This HR slot is closed.' },
          { status: 409 }
        )
      }
    }

    const resolved = await getResolvedEvaluationQuestions({
      relationshipType: assignment.relationshipType as RelationshipType,
      periodId,
      evaluatorId: user.id,
      evaluateeId,
    })

    if (resolved.error) {
      return NextResponse.json({ error: resolved.error }, { status: 400 })
    }

    const allowedQuestions = new Map<string, (typeof resolved.questions)[number]>(
      resolved.questions.map((question) => [`${question.sourceType}:${question.id}`, question] as const)
    )
    if (!allowedQuestions.has(`${questionSource}:${questionId}`)) {
      return NextResponse.json(
        { error: 'Question is not valid for this evaluation relationship' },
        { status: 400 }
      )
    }

    // Save as draft (no submittedAt)
    const existing = await findExistingEvaluation({
      evaluatorId: user.id,
      evaluateeId,
      periodId,
      questionId,
      questionSource,
    })

    const payload = {
      ratingValue: ratingValue ?? null,
      textResponse: normalizeEvaluationTextResponse(textResponse),
    }

    const evaluation = existing
      ? await prisma.evaluation.update({
          where: { id: existing.id },
          data: payload,
        })
      : await prisma.evaluation.create({
          data: {
            evaluatorId: user.id,
            evaluateeId,
            periodId,
            questionId: questionSource === 'GLOBAL' ? questionId : null,
            leadQuestionId: questionSource === 'LEAD' ? questionId : null,
            ...payload,
          },
        })

    return NextResponse.json({ success: true, evaluation })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }
    console.error('Failed to save draft:', error)
    return NextResponse.json(
      { error: 'Failed to save draft' },
      { status: 500 }
    )
  }
}

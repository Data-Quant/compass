import type { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isAdminRole } from '@/lib/permissions'
import { isThreeEDepartment } from '@/lib/company-branding'
import type { RelationshipType } from '@/types'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import {
  buildEvaluationPairKey,
  buildSubmittedCountMap,
  deriveSubmittedHrPairKeys,
  getAssignmentCompletionState,
  getHrPoolClosedPairKeys,
} from '@/lib/evaluation-completion'
import {
  getEvaluationQuestionMeta,
  getResolvedEvaluationQuestions,
} from '@/lib/pre-evaluation'

type EvaluationWithQuestionMeta = Prisma.EvaluationGetPayload<{
  include: {
    question: true
    leadQuestion: true
  }
}>

function hasSavedInput(evaluation: EvaluationWithQuestionMeta) {
  return (
    evaluation.ratingValue !== null ||
    Boolean(evaluation.textResponse && evaluation.textResponse.trim())
  )
}

function getLatestDate(values: Array<Date | null | undefined>) {
  return values.reduce<Date | null>((latest, value) => {
    if (!value) return latest
    if (!latest || value.getTime() > latest.getTime()) {
      return value
    }
    return latest
  }, null)
}

async function buildAssignmentDetail(params: {
  assignment: Awaited<ReturnType<typeof getResolvedEvaluationAssignments>>[number]
  pairEvaluations: EvaluationWithQuestionMeta[]
  periodId: string
  hrPoolClosedPairKeys: ReadonlySet<string>
  submittedCounts: ReadonlyMap<string, number>
  direction: 'incoming' | 'outgoing'
}) {
  const { assignment, pairEvaluations, periodId } = params
  const resolvedQuestions = await getResolvedEvaluationQuestions({
    relationshipType: assignment.relationshipType as RelationshipType,
    periodId,
    evaluatorId: assignment.evaluatorId,
    evaluateeId: assignment.evaluateeId,
  })

  const questionCount = resolvedQuestions.questions.length
  const completionState = getAssignmentCompletionState({
    assignment: {
      evaluatorId: assignment.evaluatorId,
      evaluateeId: assignment.evaluateeId,
      relationshipType: assignment.relationshipType as RelationshipType,
    },
    questionsCount: questionCount,
    submittedCounts: params.submittedCounts,
    hrPoolClosedPairKeys: params.hrPoolClosedPairKeys,
  })

  const evaluationMap = new Map(
    pairEvaluations
      .map((evaluation) => {
        const meta = getEvaluationQuestionMeta(evaluation)
        if (!meta) return null
        return [meta.key, evaluation] as const
      })
      .filter(Boolean) as Array<readonly [string, EvaluationWithQuestionMeta]>
  )

  const resolvedQuestionKeys = new Set(
    resolvedQuestions.questions.map((question) => `${question.sourceType}:${question.id}`)
  )

  const currentResponses = resolvedQuestions.questions
    .map((question) => {
      const evaluation = evaluationMap.get(`${question.sourceType}:${question.id}`)
      const hasResponse = evaluation ? hasSavedInput(evaluation) : false

      return {
        key: `${question.sourceType}:${question.id}`,
        questionText: question.questionText,
        questionType: question.questionType,
        questionSource: question.sourceType,
        ratingValue: evaluation?.ratingValue ?? null,
        textResponse: evaluation?.textResponse ?? null,
        submittedAt: evaluation?.submittedAt ?? null,
        updatedAt: evaluation?.updatedAt ?? null,
        isArchived: false,
        hasResponse,
      }
    })
    .filter((response) => response.hasResponse)

  const archivedResponses = pairEvaluations
    .map((evaluation) => {
      const meta = getEvaluationQuestionMeta(evaluation)
      if (!meta || resolvedQuestionKeys.has(meta.key) || !hasSavedInput(evaluation)) {
        return null
      }

      return {
        key: meta.key,
        questionText: meta.questionText,
        questionType: meta.questionType,
        questionSource: meta.sourceType,
        ratingValue: evaluation.ratingValue,
        textResponse: evaluation.textResponse,
        submittedAt: evaluation.submittedAt,
        updatedAt: evaluation.updatedAt,
        isArchived: true,
        hasResponse: true,
      }
    })
    .filter(Boolean)

  const savedResponseCount = pairEvaluations.filter(hasSavedInput).length
  const submittedAt = getLatestDate(pairEvaluations.map((evaluation) => evaluation.submittedAt))
  const lastSavedAt = getLatestDate(
    pairEvaluations.map((evaluation) => (hasSavedInput(evaluation) ? evaluation.updatedAt : null))
  )

  let status: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'CLOSED_BY_POOL' = 'NOT_STARTED'
  if (completionState.isClosedByPool) {
    status = 'CLOSED_BY_POOL'
  } else if (completionState.isComplete) {
    status = 'SUBMITTED'
  } else if (savedResponseCount > 0) {
    status = 'IN_PROGRESS'
  }

  return {
    id:
      assignment.overrideId ||
      assignment.mappingId ||
      assignment.selectionId ||
      `${assignment.evaluatorId}:${assignment.evaluateeId}:${assignment.relationshipType}`,
    evaluatorId: assignment.evaluatorId,
    evaluateeId: assignment.evaluateeId,
    relationshipType: assignment.relationshipType,
    source: assignment.source,
    partner:
      params.direction === 'outgoing'
        ? assignment.evaluatee
        : assignment.evaluator,
    questionsCount: questionCount,
    savedResponseCount,
    submittedResponseCount: completionState.rawCompletedCount,
    completedResponseCount: completionState.completedCount,
    status,
    isClosedByPool: completionState.isClosedByPool,
    submittedAt,
    lastSavedAt,
    questionWarning: resolvedQuestions.error || null,
    responses: [...currentResponses, ...archivedResponses],
  }
}

type PeriodOverrideWithUsers = Prisma.EvaluationPeriodAssignmentOverrideGetPayload<{
  include: {
    evaluator: {
      select: { id: true; name: true; department: true; position: true }
    }
    evaluatee: {
      select: { id: true; name: true; department: true; position: true }
    }
    createdBy: {
      select: { id: true; name: true }
    }
  }
}>

function serializePeriodOverride(
  override: PeriodOverrideWithUsers,
  employeeId: string
) {
  return {
    id: override.id,
    action: override.action,
    relationshipType: override.relationshipType,
    note: override.note,
    createdAt: override.createdAt,
    createdBy: override.createdBy
      ? { id: override.createdBy.id, name: override.createdBy.name }
      : null,
    direction: override.evaluatorId === employeeId ? 'outgoing' : 'incoming',
    evaluator: {
      id: override.evaluator.id,
      name: override.evaluator.name,
      department: override.evaluator.department,
      position: override.evaluator.position,
    },
    evaluatee: {
      id: override.evaluatee.id,
      name: override.evaluatee.name,
      department: override.evaluatee.department,
      position: override.evaluatee.position,
    },
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const periodId = searchParams.get('periodId')
    const { employeeId } = await params

    const period = periodId
      ? await prisma.evaluationPeriod.findUnique({
          where: { id: periodId },
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            reviewStartDate: true,
            isActive: true,
          },
        })
      : await prisma.evaluationPeriod.findFirst({
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            reviewStartDate: true,
            isActive: true,
          },
        })

    if (!period) {
      return NextResponse.json({ error: 'Evaluation period not found' }, { status: 404 })
    }

    const employee = await prisma.user.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        name: true,
        department: true,
        position: true,
      },
    })

    if (!employee || isThreeEDepartment(employee.department)) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    const [assignments, submittedEvaluationRows, evaluations, periodOverrides] = await Promise.all([
      getResolvedEvaluationAssignments(period.id, { includeUsers: true }),
      prisma.evaluation.findMany({
        where: {
          periodId: period.id,
          submittedAt: { not: null },
        },
        select: {
          evaluatorId: true,
          evaluateeId: true,
          submittedAt: true,
          leadQuestionId: true,
          question: { select: { relationshipType: true } },
        },
      }),
      prisma.evaluation.findMany({
        where: {
          periodId: period.id,
          OR: [{ evaluatorId: employeeId }, { evaluateeId: employeeId }],
        },
        include: {
          question: true,
          leadQuestion: true,
        },
        orderBy: [{ submittedAt: 'desc' }, { updatedAt: 'desc' }],
      }),
      prisma.evaluationPeriodAssignmentOverride.findMany({
        where: {
          periodId: period.id,
          OR: [{ evaluatorId: employeeId }, { evaluateeId: employeeId }],
        },
        include: {
          evaluator: {
            select: { id: true, name: true, department: true, position: true },
          },
          evaluatee: {
            select: { id: true, name: true, department: true, position: true },
          },
          createdBy: {
            select: { id: true, name: true },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ])

    const submittedCounts = buildSubmittedCountMap(submittedEvaluationRows, assignments)
    const hrPoolClosedPairKeys = getHrPoolClosedPairKeys(
      assignments,
      deriveSubmittedHrPairKeys(submittedCounts)
    )

    const evaluationsByPair = evaluations.reduce<Map<string, EvaluationWithQuestionMeta[]>>(
      (map, evaluation) => {
        const key = buildEvaluationPairKey(evaluation.evaluatorId, evaluation.evaluateeId)
        const existing = map.get(key) || []
        existing.push(evaluation)
        map.set(key, existing)
        return map
      },
      new Map()
    )

    const outgoingAssignments = assignments.filter(
      (assignment) =>
        assignment.evaluatorId === employeeId &&
        !isThreeEDepartment(assignment.evaluatee?.department)
    )
    const incomingAssignments = assignments.filter(
      (assignment) =>
        assignment.evaluateeId === employeeId &&
        !isThreeEDepartment(assignment.evaluator?.department)
    )

    const [outgoing, incoming] = await Promise.all([
      Promise.all(
        outgoingAssignments.map((assignment) =>
          buildAssignmentDetail({
            assignment,
            pairEvaluations:
              evaluationsByPair.get(
                buildEvaluationPairKey(assignment.evaluatorId, assignment.evaluateeId)
              ) || [],
            periodId: period.id,
            hrPoolClosedPairKeys,
            submittedCounts,
            direction: 'outgoing',
          })
        )
      ),
      Promise.all(
        incomingAssignments.map((assignment) =>
          buildAssignmentDetail({
            assignment,
            pairEvaluations:
              evaluationsByPair.get(
                buildEvaluationPairKey(assignment.evaluatorId, assignment.evaluateeId)
              ) || [],
            periodId: period.id,
            hrPoolClosedPairKeys,
            submittedCounts,
            direction: 'incoming',
          })
        )
      ),
    ])

    const sortDetails = (
      items: Array<Awaited<ReturnType<typeof buildAssignmentDetail>>>
    ) =>
      [...items].sort((left, right) => {
        const nameCompare = (left.partner?.name || '').localeCompare(right.partner?.name || '')
        if (nameCompare !== 0) return nameCompare
        return left.relationshipType.localeCompare(right.relationshipType)
      })

    return NextResponse.json({
      period,
      employee,
      outgoing: sortDetails(outgoing),
      incoming: sortDetails(incoming),
      periodOverrides: periodOverrides.map((override) =>
        serializePeriodOverride(override, employeeId)
      ),
    })
  } catch (error) {
    console.error('Failed to fetch performance detail:', error)
    return NextResponse.json(
      { error: 'Failed to fetch performance detail' },
      { status: 500 }
    )
  }
}

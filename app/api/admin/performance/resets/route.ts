import type { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { getDeptEvaluationPoolContext } from '@/lib/dept-evaluation-pool'
import { getResolvedEvaluationQuestions } from '@/lib/pre-evaluation'
import { isThreeEDepartment } from '@/lib/company-branding'
import { isAdminRole } from '@/lib/permissions'
import type { RelationshipType } from '@/types'

const relationshipTypeSchema = z.enum([
  'DIRECT_REPORT',
  'TEAM_LEAD',
  'PEER',
  'C_LEVEL',
  'HR',
  'DEPT',
  'CROSS_DEPARTMENT',
])

const resetEvaluationSchema = z.object({
  periodId: z.string().trim().optional(),
  evaluatorId: z.string().trim().min(1),
  evaluateeId: z.string().trim().min(1),
  relationshipType: relationshipTypeSchema,
})

async function resolveTargetPeriod(periodId?: string | null) {
  if (periodId) {
    return prisma.evaluationPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, name: true, isActive: true },
    })
  }

  return prisma.evaluationPeriod.findFirst({
    where: { isActive: true },
    select: { id: true, name: true, isActive: true },
  })
}

async function getQuestionWhereForAssignment(params: {
  periodId: string
  evaluatorId: string
  evaluateeId: string
  relationshipType: RelationshipType
}) {
  const resolved = await getResolvedEvaluationQuestions(params)
  const globalQuestionIds = resolved.questions
    .filter((question) => question.sourceType === 'GLOBAL')
    .map((question) => question.id)
  const leadQuestionIds = resolved.questions
    .filter((question) => question.sourceType === 'LEAD')
    .map((question) => question.id)

  const questionFilters: Prisma.EvaluationWhereInput[] = []
  if (globalQuestionIds.length > 0) {
    questionFilters.push({ questionId: { in: globalQuestionIds } })
  }
  if (leadQuestionIds.length > 0) {
    questionFilters.push({ leadQuestionId: { in: leadQuestionIds } })
  }

  if (questionFilters.length === 0) {
    throw new Error(resolved.error || 'No evaluation questions are configured for this relationship')
  }

  return { OR: questionFilters } satisfies Prisma.EvaluationWhereInput
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = resetEvaluationSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid reset payload' }, { status: 400 })
    }

    const { evaluatorId, evaluateeId, relationshipType } = parsed.data
    const period = await resolveTargetPeriod(parsed.data.periodId)
    if (!period) {
      return NextResponse.json({ error: 'Evaluation period not found' }, { status: 404 })
    }

    const [evaluator, evaluatee, directAssignments] = await Promise.all([
      prisma.user.findUnique({
        where: { id: evaluatorId },
        select: { id: true, name: true, department: true },
      }),
      prisma.user.findUnique({
        where: { id: evaluateeId },
        select: { id: true, name: true, department: true },
      }),
      getResolvedEvaluationAssignments(period.id, {
        evaluatorId,
        evaluateeId,
      }),
    ])

    if (!evaluator || !evaluatee) {
      return NextResponse.json({ error: 'Evaluator or evaluatee not found' }, { status: 404 })
    }

    if (isThreeEDepartment(evaluator.department) || isThreeEDepartment(evaluatee.department)) {
      return NextResponse.json(
        { error: '3E employees are not part of performance evaluation resets' },
        { status: 400 }
      )
    }

    const matchingAssignment = directAssignments.find(
      (assignment) => assignment.relationshipType === relationshipType
    )
    if (!matchingAssignment) {
      return NextResponse.json(
        { error: 'This evaluator relationship is not active for the selected period' },
        { status: 400 }
      )
    }

    const questionWhere = await getQuestionWhereForAssignment({
      periodId: period.id,
      evaluatorId,
      evaluateeId,
      relationshipType,
    })

    let targetEvaluatorIds = [evaluatorId]
    let targetEvaluateeIds = [evaluateeId]
    let resetScope: 'ASSIGNMENT' | 'HR_POOL' | 'DEPT_POOL' = 'ASSIGNMENT'

    if (relationshipType === 'HR') {
      const hrAssignments = await getResolvedEvaluationAssignments(period.id, {
        evaluateeId,
      })
      targetEvaluatorIds = [
        ...new Set(
          hrAssignments
            .filter((assignment) => assignment.relationshipType === 'HR')
            .map((assignment) => assignment.evaluatorId)
        ),
      ]
      resetScope = 'HR_POOL'
    }

    if (relationshipType === 'DEPT') {
      const deptPool = await getDeptEvaluationPoolContext({
        periodId: period.id,
        evaluatorId,
        evaluateeId,
      })
      if (deptPool) {
        targetEvaluateeIds = deptPool.evaluateeIds
        resetScope = 'DEPT_POOL'
      }
    }

    const [deletedEvaluations, deletedReports] = await prisma.$transaction([
      prisma.evaluation.deleteMany({
        where: {
          periodId: period.id,
          evaluatorId: { in: targetEvaluatorIds },
          evaluateeId: { in: targetEvaluateeIds },
          ...questionWhere,
        },
      }),
      prisma.report.deleteMany({
        where: {
          periodId: period.id,
          employeeId: { in: targetEvaluateeIds },
        },
      }),
    ])

    return NextResponse.json({
      success: true,
      periodId: period.id,
      periodName: period.name,
      resetScope,
      deletedEvaluationRows: deletedEvaluations.count,
      deletedReports: deletedReports.count,
      affectedEvaluateeIds: targetEvaluateeIds,
      affectedEvaluatorIds: targetEvaluatorIds,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reset evaluation'
    const knownUserErrors = new Set([
      'No evaluation questions are configured for this relationship',
    ])
    console.error('Failed to reset evaluation:', error)
    return NextResponse.json(
      { error: message },
      { status: knownUserErrors.has(message) ? 400 : 500 }
    )
  }
}

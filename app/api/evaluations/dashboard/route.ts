import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type { RelationshipType } from '@/types'
import { getResolvedQuestionCount } from '@/lib/pre-evaluation'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import {
  getAssignmentCompletionState,
  getHrPoolClosedPairKeys,
  getSubmittedEvaluationCountMap,
} from '@/lib/evaluation-completion'
import {
  getDeptPoolDisplayName,
  getDeptPoolMemberLabel,
  groupDeptAssignmentsByDepartment,
  pickRepresentativeDeptAssignment,
  summarizeDeptPool,
} from '@/lib/dept-evaluation-pool'
import {
  buildAssignmentLookup,
  resolveEvaluationRelationshipTypeForRow,
} from '@/lib/evaluation-relationship-resolution'

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const periodId = searchParams.get('periodId')

    if (!periodId) {
      return NextResponse.json(
        { error: 'periodId is required' },
        { status: 400 }
      )
    }

    const period =
      periodId === 'active'
        ? await prisma.evaluationPeriod.findFirst({
            where: { isActive: true },
          })
        : await prisma.evaluationPeriod.findUnique({
            where: { id: periodId },
          })

    if (!period) {
      return NextResponse.json(
        { error: 'Period not found' },
        { status: 404 }
      )
    }

    const directReportMappings = await prisma.evaluatorMapping.findMany({
      where: {
        evaluatorId: user.id,
        relationshipType: 'TEAM_LEAD',
      },
      select: {
        evaluateeId: true,
        evaluatee: {
          select: {
            id: true,
            name: true,
            department: true,
            position: true,
          },
        },
      },
      orderBy: {
        evaluatee: { name: 'asc' },
      },
    })

    const directReportIds = directReportMappings.map((mapping) => mapping.evaluateeId)

    const [assignments, submittedEvaluations] = await Promise.all([
      getResolvedEvaluationAssignments(period.id, { includeUsers: true }),
      prisma.evaluation.groupBy({
        by: ['evaluatorId', 'evaluateeId'],
        where: {
          periodId: period.id,
          submittedAt: { not: null },
          OR: [
            { evaluatorId: user.id },
            { evaluateeId: user.id },
            ...(directReportIds.length > 0 ? [{ evaluateeId: { in: directReportIds } }] : []),
          ],
        },
        _count: { id: true },
      }),
    ])

    const submittedCounts = getSubmittedEvaluationCountMap(
      submittedEvaluations.map((evaluation) => ({
        evaluatorId: evaluation.evaluatorId,
        evaluateeId: evaluation.evaluateeId,
        count: evaluation._count.id,
      }))
    )
    const hrPoolClosedPairKeys = getHrPoolClosedPairKeys(assignments, new Set(submittedCounts.keys()))

    const outgoingAssignments = assignments.filter((assignment) => assignment.evaluatorId === user.id)
    const incomingAssignments = assignments.filter((assignment) => assignment.evaluateeId === user.id)
    const teamIncomingAssignments = assignments.filter((assignment) =>
      directReportIds.includes(assignment.evaluateeId)
    )

    const nonDeptOutgoingAssignments = outgoingAssignments.filter(
      (assignment) => assignment.relationshipType !== 'DEPT'
    )
    const deptOutgoingGroups = [...groupDeptAssignmentsByDepartment(outgoingAssignments).values()]
    const outgoingAssignmentLookup = buildAssignmentLookup(
      outgoingAssignments.map((assignment) => ({
        evaluatorId: assignment.evaluatorId,
        evaluateeId: assignment.evaluateeId,
        relationshipType: assignment.relationshipType as RelationshipType,
      }))
    )

    const outgoingWithStatus = await Promise.all([
      ...nonDeptOutgoingAssignments.map(async (assignment) => {
        const questionsCount = await getResolvedQuestionCount({
          relationshipType: assignment.relationshipType as RelationshipType,
          periodId: period.id,
          evaluatorId: assignment.evaluatorId,
          evaluateeId: assignment.evaluateeId,
        })
        const completionState = getAssignmentCompletionState({
          assignment,
          questionsCount,
          submittedCounts,
          hrPoolClosedPairKeys,
        })

        return {
          id:
            assignment.mappingId ||
            assignment.selectionId ||
            `${assignment.evaluatorId}:${assignment.evaluateeId}:${assignment.relationshipType}`,
          evaluatee: assignment.evaluatee!,
          relationshipType: assignment.relationshipType,
          questionsCount,
          completedCount: completionState.completedCount,
          isComplete: completionState.isComplete,
          isClosedByPool: completionState.isClosedByPool,
        }
      }),
      ...deptOutgoingGroups.map(async (group) => {
        const representative = pickRepresentativeDeptAssignment(group)
        const summary = summarizeDeptPool(group)
        const questionsCount = await getResolvedQuestionCount({
          relationshipType: 'DEPT',
          periodId: period.id,
          evaluatorId: representative.evaluatorId,
          evaluateeId: representative.evaluateeId,
        })
        const deptEvaluations = await prisma.evaluation.findMany({
          where: {
            periodId: period.id,
            evaluatorId: representative.evaluatorId,
            evaluateeId: { in: group.map((assignment) => assignment.evaluateeId) },
            submittedAt: { not: null },
          },
          include: {
            question: true,
            leadQuestion: true,
          },
        })
        const deptOnlyEvaluationCount = deptEvaluations.filter((evaluation) => {
          const resolvedType = resolveEvaluationRelationshipTypeForRow({
            evaluation,
            assignmentLookup: outgoingAssignmentLookup,
          })
          return resolvedType === 'DEPT'
        }).length
        const completedCount = Math.min(questionsCount, deptOnlyEvaluationCount)
        const isComplete = questionsCount > 0 && deptOnlyEvaluationCount >= questionsCount

        return {
          id: `DEPT_POOL:${representative.evaluatorId}:${summary.departmentKey}`,
          evaluatee: {
            id: representative.evaluateeId,
            name: getDeptPoolDisplayName(summary.department),
            department: representative.evaluatee?.department || null,
            position: getDeptPoolMemberLabel(summary.memberCount),
          },
          relationshipType: 'DEPT',
          questionsCount,
          completedCount,
          isComplete,
          isClosedByPool: false,
        }
      }),
    ])

    const incomingWithStatus = await Promise.all(
      incomingAssignments.map(async (assignment) => {
        const questionsCount = await getResolvedQuestionCount({
          relationshipType: assignment.relationshipType as RelationshipType,
          periodId: period.id,
          evaluatorId: assignment.evaluatorId,
          evaluateeId: assignment.evaluateeId,
        })
        const completionState = getAssignmentCompletionState({
          assignment,
          questionsCount,
          submittedCounts,
          hrPoolClosedPairKeys,
        })

        return {
          id:
            assignment.mappingId ||
            assignment.selectionId ||
            `${assignment.evaluatorId}:${assignment.evaluateeId}:${assignment.relationshipType}`,
          evaluator: assignment.evaluator!,
          relationshipType: assignment.relationshipType,
          questionsCount,
          completedCount: completionState.completedCount,
          isSubmitted: completionState.isComplete,
          isClosedByPool: completionState.isClosedByPool,
        }
      })
    )

    const teamIncomingByMember = await Promise.all(
      directReportMappings.map(async (directReport) => {
        const memberAssignments = teamIncomingAssignments.filter(
          (assignment) => assignment.evaluateeId === directReport.evaluateeId
        )

        const evaluators = await Promise.all(
          memberAssignments.map(async (assignment) => {
            const questionsCount = await getResolvedQuestionCount({
              relationshipType: assignment.relationshipType as RelationshipType,
              periodId: period.id,
              evaluatorId: assignment.evaluatorId,
              evaluateeId: assignment.evaluateeId,
            })
            const completionState = getAssignmentCompletionState({
              assignment,
              questionsCount,
              submittedCounts,
              hrPoolClosedPairKeys,
            })

            return {
              id:
                assignment.mappingId ||
                assignment.selectionId ||
                `${assignment.evaluatorId}:${assignment.evaluateeId}:${assignment.relationshipType}`,
              evaluator: assignment.evaluator!,
              relationshipType: assignment.relationshipType,
              questionsCount,
              completedCount: completionState.completedCount,
              isSubmitted: completionState.isComplete,
              isClosedByPool: completionState.isClosedByPool,
            }
          })
        )

        return {
          teamMember: directReport.evaluatee,
          evaluators: evaluators.sort((a, b) => {
            const nameCompare = a.evaluator.name.localeCompare(b.evaluator.name)
            if (nameCompare !== 0) return nameCompare
            return a.relationshipType.localeCompare(b.relationshipType)
          }),
        }
      })
    )

    const grouped = outgoingWithStatus.reduce(
      (acc, mapping) => {
        const type = mapping.relationshipType
        if (!acc[type]) {
          acc[type] = []
        }
        acc[type].push(mapping)
        return acc
      },
      {} as Record<string, typeof outgoingWithStatus>
    )

    return NextResponse.json({
      period,
      mappings: grouped,
      incoming: incomingWithStatus,
      teamIncoming: teamIncomingByMember,
      totalMappings: outgoingWithStatus.length,
      completedMappings: outgoingWithStatus.filter((mapping) => mapping.isComplete).length,
    })
  } catch (error) {
    console.error('Failed to fetch dashboard data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    )
  }
}

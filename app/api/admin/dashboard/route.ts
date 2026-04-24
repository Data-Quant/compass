import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import type { RelationshipType } from '@/types'
import { getResolvedQuestionCount } from '@/lib/pre-evaluation'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { isThreeEDepartment } from '@/lib/company-branding'
import {
  buildSubmittedCountMap,
  collapseAssignmentRequirementsByPool,
  deriveSubmittedHrPairKeys,
  getAssignmentCompletionState,
  getHrPoolClosedPairKeys,
} from '@/lib/evaluation-completion'

export async function GET() {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const period = await prisma.evaluationPeriod.findFirst({
      where: { isActive: true },
    })

    if (!period) {
      return NextResponse.json({ error: 'No active period found' }, { status: 404 })
    }

    const [allTeamMembers, allMappings, submittedEvaluationRows, allReports] =
      await Promise.all([
        prisma.user.findMany({
          select: { id: true, name: true, department: true, position: true },
        }),
        getResolvedEvaluationAssignments(period.id),
        prisma.evaluation.findMany({
          where: { periodId: period.id, submittedAt: { not: null } },
          select: {
            evaluatorId: true,
            evaluateeId: true,
            submittedAt: true,
            leadQuestionId: true,
            question: { select: { relationshipType: true } },
          },
        }),
        prisma.report.findMany({
          where: { periodId: period.id },
          select: { employeeId: true },
        }),
      ])

    const teamMembers = allTeamMembers.filter(
      (member) => !isThreeEDepartment(member.department)
    )

    const questionCounts = await Promise.all(
      allMappings.map(async (mapping) => ({
        evaluatorId: mapping.evaluatorId,
        evaluateeId: mapping.evaluateeId,
        relationshipType: mapping.relationshipType,
        total: await getResolvedQuestionCount({
          relationshipType: mapping.relationshipType as RelationshipType,
          periodId: period.id,
          evaluatorId: mapping.evaluatorId,
          evaluateeId: mapping.evaluateeId,
        }),
      }))
    )

    const submittedPairCounts = buildSubmittedCountMap(submittedEvaluationRows, allMappings)
    const hrPoolClosedPairKeys = getHrPoolClosedPairKeys(
      allMappings,
      deriveSubmittedHrPairKeys(submittedPairCounts)
    )

    const inboundEvaluatorCountMap = new Map<string, number>()
    const inboundTotalNeededMap = new Map<string, number>()
    const inboundCompletedNeededMap = new Map<string, number>()
    const outboundEvaluateeCountMap = new Map<string, number>()
    const outboundTotalNeededMap = new Map<string, number>()
    const outboundCompletedNeededMap = new Map<string, number>()
    const assignmentRequirements = questionCounts.map((entry) => {
      const assignment = {
        evaluatorId: entry.evaluatorId,
        evaluateeId: entry.evaluateeId,
        relationshipType: entry.relationshipType as RelationshipType,
      }
      const completionState = getAssignmentCompletionState({
        assignment,
        questionsCount: entry.total,
        submittedCounts: submittedPairCounts,
        hrPoolClosedPairKeys,
      })

      return {
        ...assignment,
        questionsCount: entry.total,
        isComplete: completionState.isComplete,
      }
    })
    const collapsedRequirements = collapseAssignmentRequirementsByPool(assignmentRequirements)

    for (const entry of collapsedRequirements) {
      inboundEvaluatorCountMap.set(
        entry.evaluateeId,
        (inboundEvaluatorCountMap.get(entry.evaluateeId) || 0) + 1
      )
      inboundTotalNeededMap.set(
        entry.evaluateeId,
        (inboundTotalNeededMap.get(entry.evaluateeId) || 0) + entry.questionsCount
      )
      inboundCompletedNeededMap.set(
        entry.evaluateeId,
        (inboundCompletedNeededMap.get(entry.evaluateeId) || 0) + (entry.isComplete ? entry.questionsCount : 0)
      )
    }

    for (const entry of assignmentRequirements) {
      outboundEvaluateeCountMap.set(
        entry.evaluatorId,
        (outboundEvaluateeCountMap.get(entry.evaluatorId) || 0) + 1
      )
      outboundTotalNeededMap.set(
        entry.evaluatorId,
        (outboundTotalNeededMap.get(entry.evaluatorId) || 0) + entry.questionsCount
      )
      outboundCompletedNeededMap.set(
        entry.evaluatorId,
        (outboundCompletedNeededMap.get(entry.evaluatorId) || 0) + (entry.isComplete ? entry.questionsCount : 0)
      )
    }
    const reportSet = new Set(allReports.map((r) => r.employeeId))

    const statusData = teamMembers.map((member) => {
      const inboundEvaluatorCount = inboundEvaluatorCountMap.get(member.id) || 0
      const inboundCompletedQuestions = inboundCompletedNeededMap.get(member.id) || 0
      const inboundTotalQuestions = inboundTotalNeededMap.get(member.id) || 0
      const inboundCompletionRate =
        inboundTotalQuestions > 0 ? (inboundCompletedQuestions / inboundTotalQuestions) * 100 : 0
      const outboundEvaluateeCount = outboundEvaluateeCountMap.get(member.id) || 0
      const outboundCompletedQuestions = outboundCompletedNeededMap.get(member.id) || 0
      const outboundTotalQuestions = outboundTotalNeededMap.get(member.id) || 0
      const outboundCompletionRate =
        outboundTotalQuestions > 0 ? (outboundCompletedQuestions / outboundTotalQuestions) * 100 : 0

      return {
        ...member,
        totalEvaluators: inboundEvaluatorCount,
        completedEvaluations: inboundCompletedQuestions,
        totalNeeded: inboundTotalQuestions,
        completionRate: Math.round(inboundCompletionRate),
        inboundEvaluatorCount,
        inboundCompletedQuestions,
        inboundTotalQuestions,
        inboundCompletionRate: Math.round(inboundCompletionRate),
        outboundEvaluateeCount,
        outboundCompletedQuestions,
        outboundTotalQuestions,
        outboundCompletionRate: Math.round(outboundCompletionRate),
        reportGenerated: reportSet.has(member.id),
      }
    })

    const totalTeamMembers = teamMembers.length
    const employeesWithReports = statusData.filter((s) => s.reportGenerated).length
    const averageInboundCompletion =
      totalTeamMembers > 0
        ? statusData.reduce((sum, s) => sum + s.completionRate, 0) / totalTeamMembers
        : 0
    const averageOutboundCompletion =
      totalTeamMembers > 0
        ? statusData.reduce((sum, s) => sum + s.outboundCompletionRate, 0) / totalTeamMembers
        : 0

    return NextResponse.json({
      period,
      summary: {
        totalTeamMembers,
        totalEmployees: totalTeamMembers,
        employeesWithReports,
        averageCompletion: Math.round(averageInboundCompletion),
        averageInboundCompletion: Math.round(averageInboundCompletion),
        averageOutboundCompletion: Math.round(averageOutboundCompletion),
      },
      employees: statusData,
    })
  } catch (error) {
    console.error('Failed to fetch admin data:', error)
    return NextResponse.json({ error: 'Failed to fetch admin data' }, { status: 500 })
  }
}

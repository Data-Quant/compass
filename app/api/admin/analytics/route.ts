import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import type { RelationshipType } from '@/types'
import { getResolvedQuestionCount } from '@/lib/pre-evaluation'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { shouldReceiveConstantEvaluations } from '@/lib/evaluation-profile-rules'
import { generateDetailedReport } from '@/lib/reports'
import {
  buildSubmittedCountMap,
  collapseAssignmentRequirementsByPool,
  deriveSubmittedHrPairKeys,
  getAssignmentCompletionState,
  getHrPoolClosedPairKeys,
} from '@/lib/evaluation-completion'

const RELATIONSHIP_TYPES: RelationshipType[] = [
  'C_LEVEL',
  'TEAM_LEAD',
  'DIRECT_REPORT',
  'PEER',
  'CROSS_DEPARTMENT',
  'HR',
  'DEPT',
  'SELF',
]

function getScoreRange(score: number) {
  if (score <= 20) return '0-20%'
  if (score <= 40) return '21-40%'
  if (score <= 60) return '41-60%'
  if (score <= 80) return '61-80%'
  return '81-100%'
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const periodId = searchParams.get('periodId')

    const period =
      periodId && periodId !== 'active'
        ? await prisma.evaluationPeriod.findUnique({ where: { id: periodId } })
        : await prisma.evaluationPeriod.findFirst({ where: { isActive: true } })

    if (!period) {
      return NextResponse.json({ error: 'No period found' }, { status: 404 })
    }

    const [submittedEvaluationRows, allTeamMembers, allMappings] = await Promise.all([
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
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          department: true,
          position: true,
        },
      }),
      getResolvedEvaluationAssignments(period.id),
    ])

    const reportableMembers = allTeamMembers.filter(shouldReceiveConstantEvaluations)
    const reportableMemberIds = new Set(reportableMembers.map((member) => member.id))

    const questionCounts = await Promise.all(
      allMappings.map(async (mapping) => ({
        evaluatorId: mapping.evaluatorId,
        evaluateeId: mapping.evaluateeId,
        relationshipType: mapping.relationshipType as RelationshipType,
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
    const assignmentRequirements = questionCounts.map((entry) => {
      const assignment = {
        evaluatorId: entry.evaluatorId,
        evaluateeId: entry.evaluateeId,
        relationshipType: entry.relationshipType,
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

    const completionByEmployee = new Map<
      string,
      { totalQuestions: number; completedQuestions: number; completionRate: number }
    >()
    for (const member of reportableMembers) {
      const entries = collapsedRequirements.filter((entry) => entry.evaluateeId === member.id)
      const totalQuestions = entries.reduce((sum, entry) => sum + entry.questionsCount, 0)
      const completedQuestions = entries.reduce(
        (sum, entry) => sum + (entry.isComplete ? entry.questionsCount : 0),
        0
      )
      const completionRate = totalQuestions > 0 ? (completedQuestions / totalQuestions) * 100 : 0
      completionByEmployee.set(member.id, {
        totalQuestions,
        completedQuestions,
        completionRate,
      })
    }

    const generatedReports = (
      await Promise.all(
        reportableMembers.map(async (employee) => {
          try {
            const report = await generateDetailedReport(employee.id, period.id)
            return {
              employee,
              overallScore: report.overallScore,
            }
          } catch (error) {
            console.error(`Failed to generate analytics report for ${employee.id}:`, error)
            return null
          }
        })
      )
    ).filter(Boolean) as Array<{
      employee: (typeof reportableMembers)[number]
      overallScore: number
    }>

    const reportByEmployeeId = new Map(
      generatedReports.map((report) => [report.employee.id, report])
    )
    const departmentStats: Record<
      string,
      {
        total: number
        completed: number
        completionSum: number
        scores: number[]
      }
    > = {}

    for (const member of reportableMembers) {
      const dept = member.department || 'Unknown'
      if (!departmentStats[dept]) {
        departmentStats[dept] = { total: 0, completed: 0, completionSum: 0, scores: [] }
      }

      const completion = completionByEmployee.get(member.id)?.completionRate || 0
      departmentStats[dept].total++
      departmentStats[dept].completionSum += completion
      if (completion >= 99.5) {
        departmentStats[dept].completed++
      }

      const report = reportByEmployeeId.get(member.id)
      if (report) {
        departmentStats[dept].scores.push(report.overallScore)
      }
    }

    const departmentData = Object.entries(departmentStats)
      .map(([name, stats]) => ({
        name,
        employees: stats.total,
        completed: stats.completed,
        completionRate:
          stats.total > 0 ? Math.round((stats.completionSum / stats.total) * 100) / 100 : 0,
        avgScore:
          stats.scores.length > 0
            ? Math.round((stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length) * 100) /
              100
            : 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const scoreDistributionMap = new Map([
      ['0-20%', 0],
      ['21-40%', 0],
      ['41-60%', 0],
      ['61-80%', 0],
      ['81-100%', 0],
    ])
    for (const report of generatedReports) {
      const range = getScoreRange(report.overallScore)
      scoreDistributionMap.set(range, (scoreDistributionMap.get(range) || 0) + 1)
    }

    const evaluatorMappingsCount = Object.fromEntries(
      RELATIONSHIP_TYPES.map((type) => [type, 0])
    ) as Record<RelationshipType, number>

    for (const mapping of allMappings) {
      if (!reportableMemberIds.has(mapping.evaluateeId)) continue
      evaluatorMappingsCount[mapping.relationshipType as RelationshipType]++
    }

    const relationshipData = Object.entries(evaluatorMappingsCount).map(([type, count]) => ({
      type,
      count,
    }))

    const sortedReports = [...generatedReports].sort((a, b) => b.overallScore - a.overallScore)
    const topPerformers = sortedReports.slice(0, 5).map((report) => ({
      name: report.employee.name,
      department: report.employee.department,
      score: Math.round(report.overallScore * 100) / 100,
    }))
    const bottomPerformers = sortedReports
      .slice(-5)
      .reverse()
      .map((report) => ({
        name: report.employee.name,
        department: report.employee.department,
        score: Math.round(report.overallScore * 100) / 100,
      }))

    const totalTeamMembers = reportableMembers.length
    const totalEvaluations = submittedEvaluationRows.length
    const totalReports = generatedReports.length
    const avgOverallScore =
      generatedReports.length > 0
        ? Math.round(
            (generatedReports.reduce((sum, report) => sum + report.overallScore, 0) /
              generatedReports.length) *
              100
          ) / 100
        : 0
    const employeesComplete = reportableMembers.filter(
      (member) => (completionByEmployee.get(member.id)?.completionRate || 0) >= 99.5
    ).length
    const averageCompletion =
      totalTeamMembers > 0
        ? Math.round(
            (reportableMembers.reduce(
              (sum, member) => sum + (completionByEmployee.get(member.id)?.completionRate || 0),
              0
            ) /
              totalTeamMembers) *
              100
          ) / 100
        : 0

    return NextResponse.json({
      period,
      summary: {
        totalTeamMembers,
        totalEmployees: totalTeamMembers,
        employeesWithEvaluations: employeesComplete,
        employeesComplete,
        totalEvaluations,
        totalReports,
        avgOverallScore,
        completionRate: averageCompletion,
      },
      departmentData,
      scoreDistribution: Array.from(scoreDistributionMap.entries()).map(([range, count]) => ({
        range,
        count,
      })),
      relationshipData,
      topPerformers,
      bottomPerformers,
    })
  } catch (error) {
    console.error('Failed to fetch analytics:', error)
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
}

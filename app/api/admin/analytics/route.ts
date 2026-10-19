import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import type { RelationshipType } from '@/types'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { shouldReceiveConstantEvaluations } from '@/lib/evaluation-profile-rules'
import { generateDetailedReport } from '@/lib/reports'
import { weeklyOverviewProgress } from '@/lib/weekly/service/overview-progress'

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
          source: true,
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

    const mappedEvaluateeIds = new Set(allMappings.map((mapping) => mapping.evaluateeId))
    const analyticsMembers = allTeamMembers.filter(
      (member) => shouldReceiveConstantEvaluations(member) && mappedEvaluateeIds.has(member.id)
    )
    const analyticsMemberIds = new Set(analyticsMembers.map((member) => member.id))

    // Completion is the weekly coverage: topics about each person with accepted evidence. Quarters that did not run on
    // weekly evaluations have no completion figure.
    const weekly = await weeklyOverviewProgress(period.id)
    const completionByEmployee = new Map<string, number | null>(
      analyticsMembers.map((member) => {
        const p = weekly?.get(member.id)
        return [member.id, weekly && p && p.topics > 0 ? (p.coveredTopics / p.topics) * 100 : weekly ? 0 : null]
      })
    )

    const generatedReports = (
      await Promise.all(
        analyticsMembers.map(async (employee) => {
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
      employee: (typeof analyticsMembers)[number]
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

    for (const member of analyticsMembers) {
      const dept = member.department || 'Unknown'
      if (!departmentStats[dept]) {
        departmentStats[dept] = { total: 0, completed: 0, completionSum: 0, scores: [] }
      }

      const completion = completionByEmployee.get(member.id) ?? 0
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
          weekly && stats.total > 0 ? Math.round((stats.completionSum / stats.total) * 100) / 100 : null,
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
      if (!analyticsMemberIds.has(mapping.evaluateeId)) continue
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

    const totalTeamMembers = analyticsMembers.length
    const totalEvaluations = submittedEvaluationRows.filter((row) =>
      analyticsMemberIds.has(row.evaluateeId)
    ).length
    const totalReports = generatedReports.length
    const avgOverallScore =
      generatedReports.length > 0
        ? Math.round(
            (generatedReports.reduce((sum, report) => sum + report.overallScore, 0) /
              generatedReports.length) *
              100
          ) / 100
        : 0
    const employeesComplete = weekly
      ? analyticsMembers.filter((member) => (completionByEmployee.get(member.id) ?? 0) >= 99.5).length
      : null
    const averageCompletion =
      weekly && totalTeamMembers > 0
        ? Math.round(
            (analyticsMembers.reduce((sum, member) => sum + (completionByEmployee.get(member.id) ?? 0), 0) /
              totalTeamMembers) *
              100
          ) / 100
        : null

    return NextResponse.json({
      period,
      summary: {
        totalTeamMembers,
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

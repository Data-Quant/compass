import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { RelationshipType } from '@/types'

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const periodId = searchParams.get('periodId')

    const period = periodId
      ? await prisma.evaluationPeriod.findUnique({ where: { id: periodId } })
      : await prisma.evaluationPeriod.findFirst({ where: { isActive: true } })

    if (!period) {
      return NextResponse.json({ error: 'No period found' }, { status: 404 })
    }

    const [evaluations, reports, teamMembers, mappings] = await Promise.all([
      prisma.evaluation.findMany({
        where: {
          periodId: period.id,
          submittedAt: { not: null },
        },
        include: {
          question: true,
        },
      }),
      prisma.report.findMany({
        where: { periodId: period.id },
        include: {
          employee: {
            select: { id: true, name: true, department: true, position: true },
          },
        },
      }),
      prisma.user.findMany(),
      prisma.evaluatorMapping.findMany(),
    ])

    const departmentStats: Record<
      string,
      { total: number; completed: number; avgScore: number; scores: number[] }
    > = {}

    for (const member of teamMembers) {
      const dept = member.department || 'Unknown'
      if (!departmentStats[dept]) {
        departmentStats[dept] = { total: 0, completed: 0, avgScore: 0, scores: [] }
      }
      departmentStats[dept].total++

      const memberEvals = evaluations.filter((e) => e.evaluateeId === member.id)
      if (memberEvals.length > 0) {
        departmentStats[dept].completed++
      }

      const report = reports.find((r) => r.employeeId === member.id)
      if (report) {
        departmentStats[dept].scores.push(report.overallScore)
      }
    }

    const departmentData = Object.entries(departmentStats).map(([name, stats]) => ({
      name,
      employees: stats.total,
      completed: stats.completed,
      completionRate: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
      avgScore:
        stats.scores.length > 0
          ? Math.round((stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length) * 100) / 100
          : 0,
    }))

    const scoreRanges = [
      { range: '0-20%', min: 0, max: 20, count: 0 },
      { range: '21-40%', min: 21, max: 40, count: 0 },
      { range: '41-60%', min: 41, max: 60, count: 0 },
      { range: '61-80%', min: 61, max: 80, count: 0 },
      { range: '81-100%', min: 81, max: 100, count: 0 },
    ]

    for (const report of reports) {
      for (const range of scoreRanges) {
        if (report.overallScore >= range.min && report.overallScore <= range.max) {
          range.count++
          break
        }
      }
    }

    const evaluatorMappingsCount: Record<RelationshipType, number> = {
      C_LEVEL: 0,
      TEAM_LEAD: 0,
      DIRECT_REPORT: 0,
      PEER: 0,
      HR: 0,
      DEPT: 0,
      SELF: 0,
    }

    for (const mapping of mappings) {
      evaluatorMappingsCount[mapping.relationshipType]++
    }

    const relationshipData = Object.entries(evaluatorMappingsCount).map(([type, count]) => ({
      type,
      count,
    }))

    const sortedReports = [...reports].sort((a, b) => b.overallScore - a.overallScore)
    const topPerformers = sortedReports.slice(0, 5).map((r) => ({
      name: r.employee.name,
      department: r.employee.department,
      score: Math.round(r.overallScore * 100) / 100,
    }))
    const bottomPerformers = sortedReports
      .slice(-5)
      .reverse()
      .map((r) => ({
        name: r.employee.name,
        department: r.employee.department,
        score: Math.round(r.overallScore * 100) / 100,
      }))

    const totalTeamMembers = teamMembers.length
    const totalEvaluations = evaluations.length
    const totalReports = reports.length
    const avgOverallScore =
      reports.length > 0
        ? Math.round((reports.reduce((sum, r) => sum + r.overallScore, 0) / reports.length) * 100) / 100
        : 0

    const evaluateeIds = new Set(evaluations.map((e) => e.evaluateeId))
    const employeesWithEvaluations = evaluateeIds.size

    return NextResponse.json({
      period,
      summary: {
        totalTeamMembers,
        totalEmployees: totalTeamMembers,
        employeesWithEvaluations,
        totalEvaluations,
        totalReports,
        avgOverallScore,
        completionRate: totalTeamMembers > 0 ? Math.round((employeesWithEvaluations / totalTeamMembers) * 100) : 0,
      },
      departmentData,
      scoreDistribution: scoreRanges.map((r) => ({ range: r.range, count: r.count })),
      relationshipData,
      topPerformers,
      bottomPerformers,
    })
  } catch (error) {
    console.error('Failed to fetch analytics:', error)
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
}

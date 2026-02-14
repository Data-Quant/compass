import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'

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

    const [teamMembers, totalQuestions, allMappings, allCompletedEvals, allReports] =
      await Promise.all([
        prisma.user.findMany({
          select: { id: true, name: true, department: true, position: true },
        }),
        prisma.evaluationQuestion.count(),
        prisma.evaluatorMapping.groupBy({
          by: ['evaluateeId'],
          _count: { id: true },
        }),
        prisma.evaluation.groupBy({
          by: ['evaluateeId'],
          where: { periodId: period.id, submittedAt: { not: null } },
          _count: { id: true },
        }),
        prisma.report.findMany({
          where: { periodId: period.id },
          select: { employeeId: true },
        }),
      ])

    const mappingsMap = new Map(allMappings.map((m) => [m.evaluateeId, m._count.id]))
    const evalsMap = new Map(allCompletedEvals.map((e) => [e.evaluateeId, e._count.id]))
    const reportSet = new Set(allReports.map((r) => r.employeeId))

    const statusData = teamMembers.map((member) => {
      const evaluatorCount = mappingsMap.get(member.id) || 0
      const completedEvaluations = evalsMap.get(member.id) || 0
      const totalNeeded = evaluatorCount * totalQuestions
      const completionRate = totalNeeded > 0 ? (completedEvaluations / totalNeeded) * 100 : 0

      return {
        ...member,
        totalEvaluators: evaluatorCount,
        completedEvaluations,
        totalNeeded,
        completionRate: Math.round(completionRate),
        reportGenerated: reportSet.has(member.id),
      }
    })

    const totalTeamMembers = teamMembers.length
    const employeesWithReports = statusData.filter((s) => s.reportGenerated).length
    const averageCompletion =
      totalTeamMembers > 0
        ? statusData.reduce((sum, s) => sum + s.completionRate, 0) / totalTeamMembers
        : 0

    return NextResponse.json({
      period,
      summary: {
        totalTeamMembers,
        totalEmployees: totalTeamMembers,
        employeesWithReports,
        averageCompletion: Math.round(averageCompletion),
      },
      employees: statusData,
    })
  } catch (error) {
    console.error('Failed to fetch admin data:', error)
    return NextResponse.json({ error: 'Failed to fetch admin data' }, { status: 500 })
  }
}

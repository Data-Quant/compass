import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const user = await getSession()
    if (!user || user.role !== 'HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get active period
    const period = await prisma.evaluationPeriod.findFirst({
      where: { isActive: true },
    })

    if (!period) {
      return NextResponse.json({ error: 'No active period found' }, { status: 404 })
    }

    // ── Batch queries (6 DB calls instead of 202) ──

    const [employees, totalQuestions, allMappings, allCompletedEvals, allReports] =
      await Promise.all([
        // 1. All employees
        prisma.user.findMany({
          where: { role: 'EMPLOYEE' },
          select: { id: true, name: true, department: true, position: true },
        }),

        // 2. Total question count (was repeated N times in loop)
        prisma.evaluationQuestion.count(),

        // 3. All mappings grouped by evaluateeId
        prisma.evaluatorMapping.groupBy({
          by: ['evaluateeId'],
          _count: { id: true },
        }),

        // 4. All completed evaluations grouped by evaluateeId
        prisma.evaluation.groupBy({
          by: ['evaluateeId'],
          where: { periodId: period.id, submittedAt: { not: null } },
          _count: { id: true },
        }),

        // 5. All reports for this period
        prisma.report.findMany({
          where: { periodId: period.id },
          select: { employeeId: true },
        }),
      ])

    // ── Join in-memory using Maps ──

    const mappingsMap = new Map(
      allMappings.map((m) => [m.evaluateeId, m._count.id])
    )
    const evalsMap = new Map(
      allCompletedEvals.map((e) => [e.evaluateeId, e._count.id])
    )
    const reportSet = new Set(allReports.map((r) => r.employeeId))

    const statusData = employees.map((employee) => {
      const evaluatorCount = mappingsMap.get(employee.id) || 0
      const completedEvaluations = evalsMap.get(employee.id) || 0
      const totalNeeded = evaluatorCount * totalQuestions
      const completionRate =
        totalNeeded > 0 ? (completedEvaluations / totalNeeded) * 100 : 0

      return {
        ...employee,
        totalEvaluators: evaluatorCount,
        completedEvaluations,
        totalNeeded,
        completionRate: Math.round(completionRate),
        reportGenerated: reportSet.has(employee.id),
      }
    })

    const totalEmployees = employees.length
    const employeesWithReports = statusData.filter((s) => s.reportGenerated).length
    const averageCompletion =
      totalEmployees > 0
        ? statusData.reduce((sum, s) => sum + s.completionRate, 0) / totalEmployees
        : 0

    return NextResponse.json({
      period,
      summary: {
        totalEmployees,
        employeesWithReports,
        averageCompletion: Math.round(averageCompletion),
      },
      employees: statusData,
    })
  } catch (error) {
    console.error('Failed to fetch admin data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch admin data' },
      { status: 500 }
    )
  }
}

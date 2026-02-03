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

    // Get all employees
    const employees = await prisma.user.findMany({
      where: { role: 'EMPLOYEE' },
      select: {
        id: true,
        name: true,
        department: true,
        position: true,
      },
    })

    // Get completion status for each employee
    const statusData = await Promise.all(
      employees.map(async (employee) => {
        // Get all evaluator mappings for this employee
        const mappings = await prisma.evaluatorMapping.findMany({
          where: { evaluateeId: employee.id },
        })

        // Get total questions needed
        const totalQuestions = await prisma.evaluationQuestion.count()

        // Get completed evaluations
        const completedEvaluations = await prisma.evaluation.count({
          where: {
            evaluateeId: employee.id,
            periodId: period.id,
            submittedAt: { not: null },
          },
        })

        const totalNeeded = mappings.length * totalQuestions
        const completionRate = totalNeeded > 0 ? (completedEvaluations / totalNeeded) * 100 : 0

        // Check if report exists
        const report = await prisma.report.findUnique({
          where: {
            employeeId_periodId: {
              employeeId: employee.id,
              periodId: period.id,
            },
          },
        })

        return {
          ...employee,
          totalEvaluators: mappings.length,
          completedEvaluations,
          totalNeeded,
          completionRate: Math.round(completionRate),
          reportGenerated: !!report,
        }
      })
    )

    const totalEmployees = employees.length
    const employeesWithReports = statusData.filter((s) => s.reportGenerated).length
    const averageCompletion = statusData.reduce((sum, s) => sum + s.completionRate, 0) / totalEmployees

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

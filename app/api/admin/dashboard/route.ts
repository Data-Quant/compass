import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { isThreeEDepartment } from '@/lib/company-branding'
import { shouldReceiveConstantEvaluations } from '@/lib/evaluation-profile-rules'
import { weeklyOverviewProgress } from '@/lib/weekly/service/overview-progress'

const percent = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0)
const average = (values: number[]) => (values.length > 0 ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : 0)

/**
 * HR's Performance Overview for the active period, from its weekly evaluations: topics with accepted evidence
 * about each person, topics each person has answered about others, and whether their report has been generated.
 */
export async function GET() {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const period = await prisma.evaluationPeriod.findFirst({ where: { isActive: true } })
    if (!period) {
      return NextResponse.json({ error: 'No active period found' }, { status: 404 })
    }

    const [people, weekly, reports] = await Promise.all([
      prisma.user.findMany({ select: { id: true, name: true, department: true, position: true } }),
      weeklyOverviewProgress(period.id),
      prisma.report.findMany({ where: { periodId: period.id }, select: { employeeId: true } }),
    ])
    const reportSet = new Set(reports.map((r) => r.employeeId))

    const employees = people
      .filter((member) => !isThreeEDepartment(member.department))
      .map((member) => {
        const p = weekly?.get(member.id)
        const inboundTopics = p?.topics ?? 0
        const outboundTopics = p?.topicsToAnswer ?? 0
        const reportEligible = shouldReceiveConstantEvaluations(member) && inboundTopics > 0
        return {
          ...member,
          inboundEvaluatorCount: p?.evaluators ?? 0,
          inboundCoveredTopics: p?.coveredTopics ?? 0,
          inboundTopics,
          inboundCompletionRate: percent(p?.coveredTopics ?? 0, inboundTopics),
          outboundEvaluateeCount: p?.evaluatees ?? 0,
          outboundAnsweredTopics: p?.answeredTopics ?? 0,
          outboundTopics,
          outboundCompletionRate: percent(p?.answeredTopics ?? 0, outboundTopics),
          reportEligible,
          reportPersisted: reportSet.has(member.id),
          reportStatus: !reportEligible ? 'NOT_APPLICABLE' : reportSet.has(member.id) ? 'READY' : 'PENDING',
        }
      })

    return NextResponse.json({
      period,
      weekly: weekly !== null,
      summary: {
        totalTeamMembers: employees.length,
        employeesWithReports: employees.filter((e) => e.reportStatus === 'READY').length,
        reportEligibleCount: employees.filter((e) => e.reportEligible).length,
        averageInboundCompletion: average(employees.filter((e) => e.inboundTopics > 0).map((e) => e.inboundCompletionRate)),
        averageOutboundCompletion: average(employees.filter((e) => e.outboundTopics > 0).map((e) => e.outboundCompletionRate)),
      },
      employees,
    })
  } catch (error) {
    console.error('Failed to fetch admin data:', error)
    return NextResponse.json({ error: 'Failed to fetch admin data' }, { status: 500 })
  }
}

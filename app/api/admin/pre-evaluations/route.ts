import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { derivePreEvaluationStatus } from '@/lib/pre-evaluation'
import { isThreeEDepartment } from '@/lib/company-branding'

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const periodIdParam = searchParams.get('periodId')

    const periods = await prisma.evaluationPeriod.findMany({
      orderBy: { reviewStartDate: 'desc' },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        reviewStartDate: true,
        isActive: true,
        isLocked: true,
        preEvaluationTriggeredAt: true,
      },
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const periodId =
      periodIdParam ||
      periods.find((period) => {
        const reviewStartDate = new Date(period.reviewStartDate)
        reviewStartDate.setHours(0, 0, 0, 0)
        return Boolean(period.preEvaluationTriggeredAt) && reviewStartDate > today
      })?.id ||
      periods.find((period) => {
        const reviewStartDate = new Date(period.reviewStartDate)
        reviewStartDate.setHours(0, 0, 0, 0)
        return reviewStartDate > today
      })?.id ||
      periods.find((period) => period.preEvaluationTriggeredAt)?.id ||
      periods[0]?.id

    if (!periodId) {
      return NextResponse.json({ periods: [], preps: [], summary: null, period: null })
    }

    const period = periods.find((item) => item.id === periodId) || null

    const preps = await prisma.preEvaluationLeadPrep.findMany({
      where: { periodId },
      include: {
        lead: {
          select: {
            id: true,
            name: true,
            email: true,
            department: true,
            position: true,
          },
        },
        questions: {
          orderBy: { orderIndex: 'asc' },
        },
        evaluateeSelections: {
          include: {
            evaluatee: {
              select: {
                id: true,
                name: true,
                department: true,
                position: true,
              },
            },
            suggestedEvaluator: {
              select: {
                id: true,
                name: true,
                department: true,
                position: true,
              },
            },
            reviewedBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: [
            { type: 'asc' },
            { createdAt: 'asc' },
          ],
        },
        overriddenBy: {
          select: {
            id: true,
            name: true,
          },
        },
        resetBy: {
          select: {
            id: true,
            name: true,
          },
        },
        period: {
          select: {
            reviewStartDate: true,
          },
        },
      },
      orderBy: {
        lead: {
          name: 'asc',
        },
      },
    })

    const visiblePreps = preps.filter((prep) => !isThreeEDepartment(prep.lead.department))

    const normalizedPreps = visiblePreps.map((prep) => ({
      ...prep,
      status: derivePreEvaluationStatus(prep),
    }))

    const summary = {
      total: normalizedPreps.length,
      completed: normalizedPreps.filter((prep) => prep.status === 'COMPLETED').length,
      inProgress: normalizedPreps.filter((prep) => prep.status === 'IN_PROGRESS').length,
      overdue: normalizedPreps.filter((prep) => prep.status === 'OVERDUE').length,
      overridden: normalizedPreps.filter((prep) => prep.status === 'OVERRIDDEN').length,
      pending: normalizedPreps.filter((prep) => prep.status === 'PENDING').length,
      questionSubmissions: normalizedPreps.filter((prep) => prep.questionsSubmittedAt).length,
      evaluateeSubmissions: normalizedPreps.filter((prep) => prep.evaluateesSubmittedAt).length,
    }

    return NextResponse.json({
      period,
      periods,
      preps: normalizedPreps,
      summary,
    })
  } catch (error) {
    console.error('Failed to fetch pre-evaluations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pre-evaluations' },
      { status: 500 }
    )
  }
}

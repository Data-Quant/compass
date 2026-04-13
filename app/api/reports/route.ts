import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { generateDetailedReport, formatReportAsHTML } from '@/lib/reports'
import { prisma } from '@/lib/db'
import { isAdminRole } from '@/lib/permissions'
import { shouldReceiveConstantEvaluations } from '@/lib/evaluation-profile-rules'

async function resolveEvaluationPeriod(periodId: string) {
  return periodId === 'active'
    ? prisma.evaluationPeriod.findFirst({
        where: { isActive: true },
      })
    : prisma.evaluationPeriod.findUnique({
        where: { id: periodId },
      })
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    const periodId = searchParams.get('periodId')
    const format = searchParams.get('format') || 'json' // 'json' or 'html' or 'pdf'
    const anonymize = searchParams.get('anonymize') === 'true'

    if (!employeeId || !periodId) {
      return NextResponse.json(
        { error: 'employeeId and periodId are required' },
        { status: 400 }
      )
    }

    // Admin can view any report, employees can only view their own
    if (!isAdminRole(user.role) && employeeId !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const employee = await prisma.user.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        name: true,
        department: true,
      },
    })

    if (!employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      )
    }

    if (!shouldReceiveConstantEvaluations(employee)) {
      return NextResponse.json(
        { error: 'This person does not receive incoming evaluations or reports' },
        { status: 400 }
      )
    }

    // Get period info
    const period = await resolveEvaluationPeriod(periodId)

    if (!period) {
      return NextResponse.json(
        { error: 'Period not found' },
        { status: 404 }
      )
    }

    // Generate detailed report (works even with incomplete scores)
    const detailedReport = await generateDetailedReport(employeeId, period.id, anonymize)

    // Return HTML format for viewing/printing
    if (format === 'html') {
      const htmlContent = formatReportAsHTML(detailedReport, {
        startDate: period.startDate,
        endDate: period.endDate,
      })

      return new NextResponse(htmlContent, {
        headers: {
          'Content-Type': 'text/html',
        },
      })
    }

    // Return JSON format (default)
    return NextResponse.json({ success: true, report: detailedReport })
  } catch (error) {
    console.error('Failed to fetch report:', error)
    return NextResponse.json(
      { error: 'Failed to fetch report' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { employeeId, periodId } = await request.json()

    if (!employeeId || !periodId) {
      return NextResponse.json(
        { error: 'employeeId and periodId are required' },
        { status: 400 }
      )
    }

    const employee = await prisma.user.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        name: true,
        department: true,
      },
    })

    if (!employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      )
    }

    if (!shouldReceiveConstantEvaluations(employee)) {
      return NextResponse.json(
        { error: 'This person does not receive incoming evaluations or reports' },
        { status: 400 }
      )
    }

    const period = await resolveEvaluationPeriod(periodId)

    if (!period) {
      return NextResponse.json(
        { error: 'Period not found' },
        { status: 404 }
      )
    }

    const report = await generateDetailedReport(employeeId, period.id)

    // Persist/refresh report so dashboard "Reports Ready" reflects current generation runs.
    await prisma.report.upsert({
      where: {
        employeeId_periodId: {
          employeeId,
          periodId: period.id,
        },
      },
      create: {
        employeeId,
        periodId: period.id,
        overallScore: report.overallScore,
        breakdownJson: report as any,
        generatedAt: new Date(),
      },
      update: {
        overallScore: report.overallScore,
        breakdownJson: report as any,
        generatedAt: new Date(),
      },
    })

    return NextResponse.json({ success: true, report })
  } catch (error) {
    console.error('Failed to generate report:', error)
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { generateDetailedReport, formatReportAsHTML } from '@/lib/reports'
import { prisma } from '@/lib/db'

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

    // HR can view any report, employees can only view their own
    if (user.role !== 'HR' && employeeId !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get period info
    const period = await prisma.evaluationPeriod.findUnique({
      where: { id: periodId },
    })

    if (!period) {
      return NextResponse.json(
        { error: 'Period not found' },
        { status: 404 }
      )
    }

    // Generate detailed report (works even with incomplete scores)
    const detailedReport = await generateDetailedReport(employeeId, periodId, anonymize)

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
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch report' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || user.role !== 'HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { employeeId, periodId } = await request.json()

    if (!employeeId || !periodId) {
      return NextResponse.json(
        { error: 'employeeId and periodId are required' },
        { status: 400 }
      )
    }

    const report = await generateDetailedReport(employeeId, periodId)
    return NextResponse.json({ success: true, report })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to generate report' },
      { status: 500 }
    )
  }
}

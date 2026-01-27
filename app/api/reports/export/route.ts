import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { generateHRSpreadsheet } from '@/lib/reports'

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || user.role !== 'HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const periodId = searchParams.get('periodId')

    if (!periodId) {
      return NextResponse.json(
        { error: 'periodId is required' },
        { status: 400 }
      )
    }

    const buffer = await generateHRSpreadsheet(periodId)

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="evaluation-report-${periodId}.xlsx"`,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to generate spreadsheet' },
      { status: 500 }
    )
  }
}

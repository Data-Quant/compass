import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { generateHRSpreadsheet } from '@/lib/reports'
import { isAdminRole } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
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

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="evaluation-report-${periodId}.xlsx"`,
      },
    })
  } catch (error) {
    console.error('Failed to generate spreadsheet:', error)
    return NextResponse.json(
      { error: 'Failed to generate spreadsheet' },
      { status: 500 }
    )
  }
}

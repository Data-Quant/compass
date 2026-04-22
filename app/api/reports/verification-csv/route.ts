import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { generateVerificationCsv } from '@/lib/reports'
import { isAdminRole } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const periodId = searchParams.get('periodId') ?? 'active'

    const csv = await generateVerificationCsv(periodId)

    const filenameSuffix = periodId === 'active' ? 'active' : periodId
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="verification-scores-${filenameSuffix}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Failed to generate verification CSV:', error)
    const message = error instanceof Error ? error.message : 'Failed to generate CSV'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { quarterMappings } from '@/lib/quarter-mappings'

export const dynamic = 'force-dynamic'

/** A quarter's mappings for auditing (`?periodId=`; the newest quarter when left out). Read-only. */
export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const periodId = request.nextUrl.searchParams.get('periodId') || undefined
    return NextResponse.json(await quarterMappings(periodId))
  } catch (error) {
    console.error('Failed to load quarter mappings:', error)
    return NextResponse.json({ error: 'Failed to load quarter mappings' }, { status: 500 })
  }
}

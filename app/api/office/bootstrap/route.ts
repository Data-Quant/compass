import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getOfficeBootstrapForUser } from '@/lib/office-v2'

export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const bootstrap = await getOfficeBootstrapForUser(user)
    return NextResponse.json(bootstrap)
  } catch (error) {
    console.error('Failed to fetch office bootstrap:', error)
    return NextResponse.json({ error: 'Failed to fetch office bootstrap' }, { status: 500 })
  }
}

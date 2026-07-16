import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAllPages } from '@/lib/handbook/queries'
import { toHubResponse } from '@/lib/handbook/audience'

export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Filtering happens here, on the server, against the session user's own tag.
    // Never return every variant for the client to filter -- teams differ on
    // compensation terms, so that would leak other teams' terms via devtools.
    const pages = await getAllPages()
    return NextResponse.json(toHubResponse(pages, user.teamTag))
  } catch (error) {
    console.error('Failed to fetch handbook hub:', error)
    return NextResponse.json({ error: 'Failed to fetch handbook' }, { status: 500 })
  }
}
